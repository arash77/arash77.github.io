---
title: "Projects & Contributions"
description: "A curated list of my technical work, open-source contributions, and PRs across GitHub"
---

# Projects & Open-Source Contributions

## Bioinformatics & Scientific Computing

### EAR Bot System (ERGA Assembly Reports)
Automated bot system for managing and reviewing ERGA Assembly Reports with complete workflow automation including PDF-to-YAML conversion, reviewer assignment, duplicate detection, and Slack notifications.
- **Repository**: [ERGA-consortium/EARs](https://github.com/ERGA-consortium/EARs)
- **Tech Stack**: Python, GitHub Actions, CI/CD, PDF Processing
- **Key Features**: Automated PR reviews, PDF parsing, YAML generation, reminder system
- **Major Contributions**: [View all PRs](https://github.com/ERGA-consortium/EARs/pulls?q=is%3Apr+author%3Aarash77+is%3Amerged) - Initial implementation and continuous improvements (2024-2025)

### Research Software Ecosystem
Metadata commons and tooling for research software discovery and documentation.
- **Repositories**: [RSEc-Atlas](https://github.com/research-software-ecosystem/RSEc-Atlas) | [content](https://github.com/research-software-ecosystem/content) | [utils](https://github.com/research-software-ecosystem/utils)
- **Tech Stack**: Python, CI, Metadata Management
- **Key Contributions**: 
  - Complete GitHub Actions and Backend updates ([PR #2](https://github.com/research-software-ecosystem/RSEc-Atlas/pull/2), [PR #4](https://github.com/research-software-ecosystem/RSEc-Atlas/pull/4))
  - Galaxy tools bulk import system ([PR #656](https://github.com/research-software-ecosystem/content/pull/656), [PR #12](https://github.com/research-software-ecosystem/utils/pull/12))
  - JSON formatting improvements ([PR #14](https://github.com/research-software-ecosystem/utils/pull/14), [PR #21](https://github.com/research-software-ecosystem/utils/pull/21))

### Galaxy Social Automation
Community-driven social media automation for the Galaxy Project ecosystem.
- **Repositories**: [galaxy-social](https://github.com/usegalaxy-eu/galaxy-social) | [galaxy-social-assistant](https://github.com/usegalaxy-eu/galaxy-social-assistant)
- **Tech Stack**: Python, GitHub Actions, CI
- **Purpose**: Automated post generation from PRs for Galaxy community engagement
- **Role**: Creator and primary developer - preview features, error handling, workflow automation, and JSON feed bot
- **Contributions**: [galaxy-social PRs](https://github.com/usegalaxy-eu/galaxy-social/pulls?q=is%3Apr+author%3Aarash77+is%3Amerged) | [galaxy-social-assistant PRs](https://github.com/usegalaxy-eu/galaxy-social-assistant/pulls?q=is%3Apr+author%3Aarash77+is%3Amerged)

---

## Python Projects & Automation

### Bots & Automation
- **[sale-telegram-bot](https://github.com/arash77/sale-telegram-bot)** - Telegram bot for sale notifications and automation
- **[lc](https://github.com/arash77/lc)** - Web crawler for lunarcrush.com data collection

### Machine Learning & Computer Vision
- **[face-detect-opencv](https://github.com/arash77/face-detect-opencv)** - Face detection using OpenCV and Python

### Data Analysis
- **[bourse](https://github.com/arash77/bourse)** - Stock market data analysis and visualization

---

## Notable Open-Source Contributions

### Galaxy Project Core
- **[galaxyproject/galaxy](https://github.com/galaxyproject/galaxy)** - Core Galaxy platform contributions ([PRs](https://github.com/galaxyproject/galaxy/pulls?q=is%3Apr+author%3Aarash77+is%3Amerged))
- **[bgruening/galaxytools](https://github.com/bgruening/galaxytools)** - Galaxy tool wrappers and utilities ([PRs](https://github.com/bgruening/galaxytools/pulls?q=is%3Apr+author%3Aarash77+is%3Amerged))
- **[galaxyproject/galaxy-hub](https://github.com/galaxyproject/galaxy-hub)** - Event imports and GTN integration ([PRs](https://github.com/galaxyproject/galaxy-hub/pulls?q=is%3Apr+author%3Aarash77+is%3Amerged))
- **[galaxyproject/galaxy-visualizations](https://github.com/galaxyproject/galaxy-visualizations)** - CI workflow implementation for testing ([PRs](https://github.com/galaxyproject/galaxy-visualizations/pulls?q=is%3Apr+author%3Aarash77+is%3Amerged))
- **[galaxyproject/tools-iuc](https://github.com/galaxyproject/tools-iuc)** - Tool updates (Tesseract 5.5.1) ([PRs](https://github.com/galaxyproject/tools-iuc/pulls?q=is%3Apr+author%3Aarash77+is%3Amerged))
- **[galaxyproject/planemo](https://github.com/galaxyproject/planemo)** - Bug fixes for URL error handling ([PRs](https://github.com/galaxyproject/planemo/pulls?q=is%3Apr+author%3Aarash77+is%3Amerged))
- **[bgruening/docker-galaxy](https://github.com/bgruening/docker-galaxy)** - Documentation deployment and GitHub Actions ([PRs](https://github.com/bgruening/docker-galaxy/pulls?q=is%3Apr+author%3Aarash77+is%3Amerged))

### Galaxy Training & Community
- **Galaxy Training Materials** - Enhanced XML feeds, external links, and GitHub Actions updates ([PRs](https://github.com/galaxyproject/training-material/pulls?q=is%3Apr+author%3Aarash77+is%3Amerged))
- **Galaxy Ecology Tools** - CI/CD workflow improvements ([PRs](https://github.com/galaxyecology/tools-ecology/pulls?q=is%3Apr+author%3Aarash77+is%3Amerged))

### UseGalaxy.eu Infrastructure
- **Infrastructure Playbook** - AI/ML tool integrations: ChatGPT, WhisperX, FLUX, LLM Hub with monitoring and TPV workflows ([PRs](https://github.com/usegalaxy-eu/infrastructure-playbook/pulls?q=is%3Apr+author%3Aarash77+is%3Amerged))
- **UseGalaxy.eu Tools** - Tool installations, retry logic, and lock file management ([PRs](https://github.com/usegalaxy-eu/usegalaxy-eu-tools/pulls?q=is%3Apr+author%3Aarash77+is%3Amerged))
- **VGCN Infrastructure** - GitHub Actions for resource conflict detection ([PRs](https://github.com/usegalaxy-eu/vgcn-infrastructure/pulls?q=is%3Apr+author%3Aarash77+is%3Amerged))

### Python Libraries
- **[PyGithub/PyGithub](https://github.com/PyGithub/PyGithub)** - Added minimize/unminimize functions for IssueComment class ([PRs](https://github.com/PyGithub/PyGithub/pulls?q=is%3Apr+author%3Aarash77+is%3Amerged))

### Cryptocurrency Trading (CCXT Library)
Added futures trading support for major exchanges in 2021:
- **CoinEx Perpetual** - Implemented perpetual futures endpoints
- **KuCoin Futures** - Added all futures URLs and `fetchTickers` function
- **Repository**: [ccxt/ccxt](https://github.com/ccxt/ccxt) ([PRs](https://github.com/ccxt/ccxt/pulls?q=is%3Apr+author%3Aarash77+is%3Amerged))
