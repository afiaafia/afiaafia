const fs = require('fs');
const path = require('path');

const USERNAME = 'afiaafia';
const GRAPHQL_API = 'https://api.github.com/graphql';

const outputPath = path.join(__dirname, '..', 'assets', 'github-stats.svg');

async function githubGraphQL(query, variables = {}) {
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
      variables,
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

function truncateText(value, maxLength = 42) {
  const text = String(value || 'GitHub project')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1)}…`;
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
  const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date));

  let longestStreak = 0;
  let runningStreak = 0;

  for (const day of sortedDays) {
    if (day.contributionCount > 0) {
      runningStreak += 1;
      longestStreak = Math.max(longestStreak, runningStreak);
    } else {
      runningStreak = 0;
    }
  }

  let currentStreak = 0;

  for (let index = sortedDays.length - 1; index >= 0; index -= 1) {
    if (sortedDays[index].contributionCount > 0) {
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

async function getData() {
  const query = `
    query {
      viewer {
        name
        followers {
          totalCount
        }

        repositories(
          first: 100
          affiliations: [OWNER]
          privacy: PUBLIC
          isFork: false
          isArchived: false
          orderBy: { field: UPDATED_AT, direction: DESC }
        ) {
          totalCount

          nodes {
            name
            description
            stargazerCount
            forkCount
            updatedAt

            languages(
              first: 10
              orderBy: { field: SIZE, direction: DESC }
            ) {
              edges {
                size
                node {
                  name
                }
              }
            }
          }
        }

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

  const viewer = data.viewer;

  const repos = viewer.repositories.nodes.filter(Boolean);

  const calendar = viewer.contributionsCollection.contributionCalendar;

  const days = calendar.weeks.flatMap((week) => week.contributionDays);

  const streaks = calculateStreaks(days);

  const totalStars = repos.reduce(
    (total, repo) => total + repo.stargazerCount,
    0
  );

  const totalForks = repos.reduce((total, repo) => total + repo.forkCount, 0);

  const languageBytes = {};

  for (const repo of repos) {
    for (const edge of repo.languages?.edges || []) {
      if (!edge?.node?.name) {
        continue;
      }

      languageBytes[edge.node.name] =
        (languageBytes[edge.node.name] || 0) + edge.size;
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

  return {
    name: viewer.name || USERNAME,
    publicRepos: viewer.repositories.totalCount,
    followers: viewer.followers.totalCount,
    totalStars,
    totalForks,
    languages,
    recentRepos: repos.slice(0, 3),
    totalContributions: calendar.totalContributions,
    currentStreak: streaks.currentStreak,
    longestStreak: streaks.longestStreak,
  };
}

function createSvg(data) {
  const languageBars = data.languages
    .map((language, index) =>
      createBar(language.name, language.percentage, 425 + index * 38)
    )
    .join('');

  const projectRows = data.recentRepos
    .map((repo, index) => {
      const y = 425 + index * 70;
      const description = truncateText(repo.description);

      return `
        <text
          x="620"
          y="${y}"
          fill="#F0F6FC"
          font-family="Arial, sans-serif"
          font-size="15"
          font-weight="600"
        >
          ${escapeXml(repo.name)}
        </text>

        <text
          x="620"
          y="${y + 23}"
          fill="#8B949E"
          font-family="Arial, sans-serif"
          font-size="12"
        >
          ${escapeXml(description)}
        </text>

        <text
          x="620"
          y="${y + 45}"
          fill="#6E7681"
          font-family="Arial, sans-serif"
          font-size="11"
        >
          ★ ${repo.stargazerCount}    ⑂ ${repo.forkCount}
        </text>
      `;
    })
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
    console.log(`Public repositories: ${data.publicRepos}`);
    console.log(`Followers: ${data.followers}`);

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
