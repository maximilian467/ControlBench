# Contributing to ControlBench

Thanks for your interest! ControlBench is an early-stage project, so feedback from people comparing RL and classical controllers is especially valuable.

## Issues

- **Bugs:** describe what you did, what you expected and what happened. Include your OS and Python/Node versions, and the error message or a screenshot.
- **Ideas and questions:** open an issue as well. For larger changes, please open an issue first so we can agree on the approach before you invest time.

## Pull requests

1. Set up the project as described in [docs/development.md](docs/development.md).
2. Keep pull requests focused: one change per PR.
3. Make sure the checks pass locally, the same ones CI runs:
   ```bash
   cd backend && pytest
   cd ../frontend && npm run lint && npm run build
   ```
4. Add or update tests for API changes.
5. Schema changes need an Alembic migration (see [Changing the database schema](docs/development.md#changing-the-database-schema)). Never edit a migration that is already on `main`.
6. Update the documentation if behavior or the API changes.

Note that code comments are currently in German; English contributions are welcome. UI text lives in `frontend/src/lib/messages.ts`: add every new string in English and German.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
