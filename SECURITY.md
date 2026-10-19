# Security policy

## Reporting a vulnerability

Please report security problems privately through GitHub: open this repository's **Security** tab and choose **Report a vulnerability**. Do not open a public issue, and never paste a Discord bot token or a `bot/.env` file into a report.

I maintain this project on my own, so I aim to acknowledge reports within 7 days and to fix confirmed problems as soon as I reasonably can. I will credit you in the fix unless you ask me not to.

## Scope

AutoMix runs only on your own computer: the player in Chrome and, if you use it, the broadcast bot in `bot/`. The bot listens on `127.0.0.1` and accepts only pages from the player's own addresses: `localhost` or `127.0.0.1` on ports 5173 and 4173 (see [bot/README.md](bot/README.md)). Any other web server you run on those ports counts as the player too. A way for a website, a file or another computer to control the player or the bot is in scope. Another program already running on your computer under your account is outside what AutoMix can defend against.

## Supported versions

Only the latest commit on `main` is supported.
