const fs = require('fs');
const path = require('path');

const USERNAME = 'afiaafia';
const API_BASE = 'https://api.github.com';

const outputPath = path.join(__dirname, '..', 'assets', 'github-stats.svg');

async function githubFetch(endpoint) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'afiaafia-github-profile',
    },
  });

  if (!response.ok) {
    throw new Error(
      `GitHub API error: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
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
    if (!repo.languages_url) continue;

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

  return {
    name: user.name || USERNAME,
    publicRepos: user.public_repos,
    followers: user.followers,
    totalStars,
    totalForks,
    languages,
    recentRepos: ownRepos.slice(0, 3),
  };
}

function createSvg(data) {
  const languageBars = data.languages
    .map((language, index) =>
      createBar(language.name, language.percentage, 250 + index * 38)
    )
    .join('');

  const projectRows = data.recentRepos
    .map(
      (repo, index) => `
        <text
          x="620"
          y="${250 + index * 55}"
          fill="#F0F6FC"
          font-family="Arial, sans-serif"
          font-size="15"
          font-weight="600"
        >
          ${escapeXml(repo.name)}
        </text>

        <text
          x="620"
          y="${273 + index * 55}"
          fill="#8B949E"
          font-family="Arial, sans-serif"
          font-size="12"
        >
          ${escapeXml(repo.description || 'GitHub project')}
        </text>
      `
    )
    .join('');

  return `
<svg
  width="1000"
  height="610"
  viewBox="0 0 1000 610"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <rect
    width="1000"
    height="610"
    rx="20"
    fill="#080B10"
  />

  <rect
    x="1"
    y="1"
    width="998"
    height="608"
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

  <!-- Stat cards -->

  <rect
    x="50"
    y="145"
    width="270"
    height="80"
    rx="14"
    fill="#0D1117"
    stroke="#21262D"
  />

  <rect
    x="340"
    y="145"
    width="270"
    height="80"
    rx="14"
    fill="#0D1117"
    stroke="#21262D"
  />

  <rect
    x="630"
    y="145"
    width="320"
    height="80"
    rx="14"
    fill="#0D1117"
    stroke="#21262D"
  />

  <text
    x="70"
    y="172"
    fill="#8B949E"
    font-family="Arial, sans-serif"
    font-size="12"
  >
    PUBLIC REPOSITORIES
  </text>

  <text
    x="70"
    y="207"
    fill="#F0F6FC"
    font-family="Arial, sans-serif"
    font-size="30"
    font-weight="700"
  >
    ${data.publicRepos}
  </text>

  <text
    x="360"
    y="172"
    fill="#8B949E"
    font-family="Arial, sans-serif"
    font-size="12"
  >
    FOLLOWERS
  </text>

  <text
    x="360"
    y="207"
    fill="#F0F6FC"
    font-family="Arial, sans-serif"
    font-size="30"
    font-weight="700"
  >
    ${data.followers}
  </text>

  <text
    x="650"
    y="172"
    fill="#8B949E"
    font-family="Arial, sans-serif"
    font-size="12"
  >
    STARS • FORKS
  </text>

  <text
    x="650"
    y="207"
    fill="#F0F6FC"
    font-family="Arial, sans-serif"
    font-size="30"
    font-weight="700"
  >
    ${data.totalStars} • ${data.totalForks}
  </text>

  <!-- Language section -->

  <rect
    x="50"
    y="250"
    width="520"
    height="310"
    rx="16"
    fill="#0D1117"
    stroke="#21262D"
  />

  <text
    x="70"
    y="285"
    fill="#F0F6FC"
    font-family="Arial, sans-serif"
    font-size="18"
    font-weight="700"
  >
    LANGUAGE FOCUS
  </text>

  <text
    x="70"
    y="308"
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
    y="250"
    width="360"
    height="310"
    rx="16"
    fill="#0D1117"
    stroke="#21262D"
  />

  <text
    x="620"
    y="285"
    fill="#F0F6FC"
    font-family="Arial, sans-serif"
    font-size="18"
    font-weight="700"
  >
    RECENT PROJECTS
  </text>

  <text
    x="620"
    y="308"
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
    y1="580"
    x2="950"
    y2="580"
    stroke="#21262D"
  />

  <text
    x="50"
    y="600"
    fill="#6E7681"
    font-family="Arial, sans-serif"
    font-size="11"
  >
    github.com/afiaafia
  </text>

  <text
    x="950"
    y="600"
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
