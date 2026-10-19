# Contributing

Thanks for your interest. AutoMix is a small project maintained by one person, so issues and small pull requests are the most helpful.

## Before you open a pull request

1. Open an issue first for anything larger than a small fix, so we can agree on the approach.
2. Run the commands under "Checks" in [AGENTS.md](AGENTS.md#checks), the same ones CI runs in `.github/workflows/ci.yml`. They must pass.
3. A bug fix should come with a test that fails before the fix and passes after it. Bot tests live in `bot/test/` and run with `npm test`.
4. Keep the change focused: one problem per pull request.
5. Never commit `bot/.env`, and never use a real Discord token in tests.

Security problems go through private reporting instead, see [SECURITY.md](SECURITY.md).

## Using coding agents

Agent-written changes are welcome. Please read the diff yourself before submitting, and say in the pull request which agent you used. [AGENTS.md](AGENTS.md) has the project map, checks and working rules.

## License

By contributing you agree that your contribution is licensed under the same license as the project (GNU AGPL-3.0, see [LICENSE](LICENSE)).
