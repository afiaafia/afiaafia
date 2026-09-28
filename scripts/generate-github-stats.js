const fs = require('fs');
const path = require('path');

const USERNAME = 'afiaafia';
const API_BASE = 'https://api.github.com';
const GRAPHQL_API = 'https://api.github.com/graphql';

const outputPath = path.join(__dirname, '..', 'assets', 'github-stats.svg');

async function githubFetch(endpoint) {
  const token = process.env.PROFILE_STATS_TOKEN;

  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'afiaafia-github-profile',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers,
  });

  if (!response.ok) {
    throw new Error(
      `GitHub API error: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

async function githubGraphQL(query) {
  const token = process.env.PROFILE_STATS_TOKEN;

  if (!token) {
    throw new Error('PROFILE_STATS_TOKEN is missing.');
  }

  const response = await fetch(GRAPHQL_API, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'afiaafia-github-profile',
    },
    body: JSON.stringify({
      query,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `GitHub GraphQL error: ${response.status} ${response.statusText}`
    );
  }

  const result = await response.json();

  if (result.errors) {
    throw new Error(result.errors.map((error) => error.message).join(', '));
  }

  return result.data;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function languageColor(language) {
  const colors = {
    JavaScript: '#F7DF1E',
    TypeScript: '#3178C6',
    Python: '#3776AB',
    HTML: '#E34F26',
    CSS: '#1572B6',
    Java: '#B07219',
    C: '#555555',
    'C++': '#F34B7D',
    PHP: '#4F5D95',
    Go: '#00ADD8',
    Rust: '#DEA584',
    Dart: '#00B4AB',
  };

  return colors[language] || '#8B949E';
}

function createBar(language, percentage, y) {
  const width = 360;
  const barWidth = Math.max(8, (percentage / 100) * width);

  return `
    <text
      x="70"
      y="${y}"
      fill="#C9D1D9"
      font-family="Arial, sans-serif"
      font-size="14"
    >
      ${escapeXml(language)}
    </text>

    <rect
      x="180"
      y="${y - 13}"
      width="${width}"
      height="10"
      rx="5"
      fill="#21262D"
    />

    <rect
      x="180"
      y="${y - 13}"
      width="${barWidth}"
      height="10"
      rx="5"
      fill="${languageColor(language)}"
    />

    <text
      x="560"
      y="${y}"
      fill="#8B949E"
      font-family="Arial, sans-serif"
      font-size="13"
    >
      ${percentage}%
    </text>
  `;
}

function calculateStreaks(days) {
  let longestStreak = 0;
  let runningStreak = 0;

  for (const day of days) {
    if (day.contributionCount > 0) {
      runningStreak += 1;
      longestStreak = Math.max(longestStreak, runningStreak);
    } else {
      runningStreak = 0;
    }
  }

  let currentStreak = 0;

  for (let index = days.length - 1; index >= 0; index -= 1) {
    if (days[index].contributionCount > 0) {
      currentStreak += 1;
    } else {
      break;
    }
  }

  return {
    currentStreak,
    longestStreak,
  };
}

async function getContributionData() {
  const query = `
    query {
      user(login: "${USERNAME}") {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }
  `;

  const data = await githubGraphQL(query);

  const calendar = data.user.contributionsCollection.contributionCalendar;

  const days = calendar.weeks.flatMap((week) => week.contributionDays);

  const streaks = calculateStreaks(days);

  return {
    totalContributions: calendar.totalContributions,
    currentStreak: streaks.currentStreak,
    longestStreak: streaks.longestStreak,
  };
}

async function getData() {
  const user = await githubFetch(`/users/${USERNAME}`);

  const repos = await githubFetch(
    `/users/${USERNAME}/repos?per_page=100&sort=updated`
  );

  const ownRepos = repos.filter((repo) => !repo.fork && !repo.archived);

  const totalStars = ownRepos.reduce(
    (total, repo) => total + repo.stargazers_count,
    0
  );

  const totalForks = ownRepos.reduce(
    (total, repo) => total + repo.forks_count,
    0
  );

  const languageBytes = {};

  for (const repo of ownRepos) {
    if (!repo.languages_url) {
      continue;
    }

    try {
      const languages = await githubFetch(
        `/repos/${USERNAME}/${repo.name}/languages`
      );

      for (const [language, bytes] of Object.entries(languages)) {
        languageBytes[language] = (languageBytes[language] || 0) + bytes;
      }
    } catch (error) {
      console.warn(`Could not read languages for ${repo.name}:`, error.message);
    }
  }

  const totalLanguageBytes = Object.values(languageBytes).reduce(
    (total, bytes) => total + bytes,
    0
  );

  const languages = Object.entries(languageBytes)
    .map(([name, bytes]) => ({
      name,
      bytes,
      percentage:
        totalLanguageBytes === 0
          ? 0
          : Math.round((bytes / totalLanguageBytes) * 100),
    }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 5);

  const contributionData = await getContributionData();

  return {
    name: user.name || USERNAME,
    publicRepos: user.public_repos,
    followers: user.followers,
    totalStars,
    totalForks,
    languages,
    recentRepos: ownRepos.slice(0, 3),
    totalContributions: contributionData.totalContributions,
    currentStreak: contributionData.currentStreak,
    longestStreak: contributionData.longestStreak,
  };
}

function createSvg(data) {
  const languageBars = data.languages
    .map((language, index) =>
      createBar(language.name, language.percentage, 330 + index * 38)
    )
    .join('');

  const projectRows = data.recentRepos
    .map(
      (repo, index) => `
        <text
          x="620"
          y="${330 + index * 70}"
          fill="#F0F6FC"
          font-family="Arial, sans-serif"
          font-size="15"
          font-weight="600"
        >
          ${escapeXml(repo.name)}
        </text>

        <text
          x="620"
          y="${353 + index * 70}"
          fill="#8B949E"
          font-family="Arial, sans-serif"
          font-size="12"
        >
          ${escapeXml(repo.description || 'GitHub project')}
        </text>

        <text
          x="620"
          y="${375 + index * 70}"
          fill="#6E7681"
          font-family="Arial, sans-serif"
          font-size="11"
        >
          ★ ${repo.stargazers_count}    ⑂ ${repo.forks_count}
        </text>
      `
    )
    .join('');

  return `
<svg
  width="1000"
  height="690"
  viewBox="0 0 1000 690"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <rect
    width="1000"
    height="690"
    rx="20"
    fill="#080B10"
  />

  <rect
    x="1"
    y="1"
    width="998"
    height="688"
    rx="19"
    stroke="#1F2937"
  />

  <!-- Header -->

  <text
    x="50"
    y="58"
    fill="#58A6FF"
    font-family="Arial, sans-serif"
    font-size="28"
    font-weight="700"
  >
    AFIA / DEVELOPMENT ACTIVITY
  </text>

  <text
    x="50"
    y="88"
    fill="#8B949E"
    font-family="Arial, sans-serif"
    font-size="14"
  >
    Code • Projects • Learning • Continuous Improvement
  </text>

  <line
    x1="50"
    y1="112"
    x2="950"
    y2="112"
    stroke="#21262D"
  />

  <!-- Activity cards -->

  <rect
    x="50"
    y="140"
    width="270"
    height="80"
    rx="14"
    fill="#0D1117"
    stroke="#21262D"
  />

  <rect
    x="340"
    y="140"
    width="270"
    height="80"
    rx="14"
    fill="#0D1117"
    stroke="#21262D"
  />

  <rect
    x="630"
    y="140"
    width="320"
    height="80"
    rx="14"
    fill="#0D1117"
    stroke="#21262D"
  />

  <text
    x="70"
    y="168"
    fill="#8B949E"
    font-family="Arial, sans-serif"
    font-size="12"
  >
    CONTRIBUTIONS
  </text>

  <text
    x="70"
    y="204"
    fill="#F0F6FC"
    font-family="Arial, sans-serif"
    font-size="30"
    font-weight="700"
  >
    ${data.totalContributions}
  </text>

  <text
    x="360"
    y="168"
    fill="#8B949E"
    font-family="Arial, sans-serif"
    font-size="12"
  >
    CURRENT STREAK
  </text>

  <text
    x="360"
    y="204"
    fill="#58A6FF"
    font-family="Arial, sans-serif"
    font-size="30"
    font-weight="700"
  >
    ${data.currentStreak} days
  </text>

  <text
    x="650"
    y="168"
    fill="#8B949E"
    font-family="Arial, sans-serif"
    font-size="12"
  >
    LONGEST STREAK
  </text>

  <text
    x="650"
    y="204"
    fill="#F0F6FC"
    font-family="Arial, sans-serif"
    font-size="30"
    font-weight="700"
  >
    ${data.longestStreak} days
  </text>

  <!-- Profile / repository cards -->

  <rect
    x="50"
    y="240"
    width="270"
    height="70"
    rx="14"
    fill="#0D1117"
    stroke="#21262D"
  />

  <rect
    x="340"
    y="240"
    width="270"
    height="70"
    rx="14"
    fill="#0D1117"
    stroke="#21262D"
  />

  <rect
    x="630"
    y="240"
    width="320"
    height="70"
    rx="14"
    fill="#0D1117"
    stroke="#21262D"
  />

  <text
    x="70"
    y="266"
    fill="#8B949E"
    font-family="Arial, sans-serif"
    font-size="11"
  >
    PUBLIC REPOSITORIES
  </text>

  <text
    x="70"
    y="295"
    fill="#F0F6FC"
    font-family="Arial, sans-serif"
    font-size="25"
    font-weight="700"
  >
    ${data.publicRepos}
  </text>

  <text
    x="360"
    y="266"
    fill="#8B949E"
    font-family="Arial, sans-serif"
    font-size="11"
  >
    FOLLOWERS
  </text>

  <text
    x="360"
    y="295"
    fill="#F0F6FC"
    font-family="Arial, sans-serif"
    font-size="25"
    font-weight="700"
  >
    ${data.followers}
  </text>

  <text
    x="650"
    y="266"
    fill="#8B949E"
    font-family="Arial, sans-serif"
    font-size="11"
  >
    STARS • FORKS
  </text>

  <text
    x="650"
    y="295"
    fill="#F0F6FC"
    font-family="Arial, sans-serif"
    font-size="25"
    font-weight="700"
  >
    ${data.totalStars} • ${data.totalForks}
  </text>

  <!-- Language section -->

  <rect
    x="50"
    y="330"
    width="520"
    height="300"
    rx="16"
    fill="#0D1117"
    stroke="#21262D"
  />

  <text
    x="70"
    y="365"
    fill="#F0F6FC"
    font-family="Arial, sans-serif"
    font-size="18"
    font-weight="700"
  >
    LANGUAGE FOCUS
  </text>

  <text
    x="70"
    y="388"
    fill="#8B949E"
    font-family="Arial, sans-serif"
    font-size="12"
  >
    Based on language usage across my repositories
  </text>

  ${languageBars}

  <!-- Projects -->

  <rect
    x="590"
    y="330"
    width="360"
    height="300"
    rx="16"
    fill="#0D1117"
    stroke="#21262D"
  />

  <text
    x="620"
    y="365"
    fill="#F0F6FC"
    font-family="Arial, sans-serif"
    font-size="18"
    font-weight="700"
  >
    RECENT PROJECTS
  </text>

  <text
    x="620"
    y="388"
    fill="#8B949E"
    font-family="Arial, sans-serif"
    font-size="12"
  >
    Recently updated repositories
  </text>

  ${projectRows}

  <!-- Footer -->

  <line
    x1="50"
    y1="650"
    x2="950"
    y2="650"
    stroke="#21262D"
  />

  <text
    x="50"
    y="672"
    fill="#6E7681"
    font-family="Arial, sans-serif"
    font-size="11"
  >
    github.com/afiaafia
  </text>

  <text
    x="950"
    y="672"
    fill="#6E7681"
    font-family="Arial, sans-serif"
    font-size="11"
    text-anchor="end"
  >
    Generated from GitHub activity
  </text>
</svg>
  `.trim();
}

async function main() {
  try {
    console.log(`Fetching GitHub data for ${USERNAME}...`);

    const data = await getData();

    console.log(`Contributions: ${data.totalContributions}`);

    console.log(`Current streak: ${data.currentStreak} days`);

    console.log(`Longest streak: ${data.longestStreak} days`);

    const svg = createSvg(data);

    fs.writeFileSync(outputPath, svg);

    console.log('GitHub stats generated successfully.');

    console.log(`Output: ${outputPath}`);
  } catch (error) {
    console.error('Failed to generate GitHub stats:');

    console.error(error);

    process.exit(1);
  }
}

main();
