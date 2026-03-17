# ListingLive

ListingLive is a real-estate content platform that turns listing photos into motion content, manages async generation workflows, and supports subscription billing, invite-code onboarding, and admin operations.

## Core Capabilities

- Photo-to-motion generation with scene templates and async task processing
- User registration, invite-code onboarding, quota management, and password reset
- Subscription billing and add-on credit packages with Stripe integration
- Admin dashboard for user, task, and invite-code operations
- Config-driven AI provider setup and local file storage workflow

## Repository Structure

- `backend/`: FastAPI application, business services, Celery tasks, and data models
- `frontend/`: Next.js application for public pages, auth flows, dashboard, and admin UI
- `config/`: versioned product configuration such as scene templates and example config files
- `alembic/`: database migrations
- `scripts/`: local development, billing, and production deployment scripts
- `doc/`: design, integration, and operations documentation

## Configuration

- Copy `.env.example` to `.env` for local development
- Copy `config/ai_provider.toml.example` to `config/ai_provider.toml` and fill in the active provider config
- For production, use `.env.prod.example` together with the deployment runbook
- Queue throttling for third-party video generation is controlled by `VIDEO_PROVIDER_CONCURRENCY_LIMIT` (default `1` for production safety on single-node deployments)
- Long-video local merge throttling is controlled by `VIDEO_LONG_MERGE_CONCURRENCY_LIMIT` (default `1`)
- `LOCAL_VIDEO_PROVIDER_DELAY_SECONDS` is only for local load testing and should stay `0` outside simulated queue tests

## Documentation

- Production deployment runbook: [`doc/production_deployment.md`](doc/production_deployment.md)
- Video pipeline release gate: [`doc/video_pipeline_release_gate.md`](doc/video_pipeline_release_gate.md)
- Stripe integration notes: [`doc/stripe_integration.md`](doc/stripe_integration.md)
- Stripe setup checklist: [`doc/stripe_setup_checklist.md`](doc/stripe_setup_checklist.md)
- AI/video provider notes: [`doc/ark_video_generation_core.md`](doc/ark_video_generation_core.md)

## Development Notes

- Python dependencies are listed in `requirements.txt`
- Frontend dependencies and scripts are defined in `frontend/package.json`
- Database schema changes are managed through Alembic migrations
- Production deployment and backup tooling lives in `scripts/prod/`

## Security Notes

- Do not commit real environment files or production secrets
- Do not expose internal deployment details publicly from production environments
- Keep production configuration outside the repository and inject it at deploy time
