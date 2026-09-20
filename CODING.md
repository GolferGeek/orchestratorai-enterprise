# CODING — orchestratorai-enterprise

Orientation brief for Coding Manager handoffs and Claude Code (`claude -p`).

**Strong CLAUDE.md / AGENTS.md already exist — point at them; do not duplicate.**

## Purpose
OrchestratorAI Enterprise unified platform (NestJS API + Vue web, provider planes, transport-types, local Supabase). Customer-controlled / white-label platform; MIT.

## In scope
- `apps/api` (platform API), `apps/web` (Vue shell + modules)
- Shared `packages/transport-types`, `packages/planes`, `packages/ui`
- Local Supabase, Lightning profile services when used
- Demo|Admin login from env (demo-user@orchestratorai.io / DemoUser123!, admin-user@orchestratorai.io / AdminUser123!)

## Out of scope
- Local Legal appliance → `~/projects/orchestratorai/orchestratorai-local`
- Governance product → `orchestratorai-governance`
- Offering/curriculum/marketing sites → `orchestratorai-offering`, `orchestratorai-curriculum`
- Apple/Pi labs → `orchestratorai-apple`, `orchestratorai-pi`

## Hard rules
- Mac Studio only for coding
- Commit and push to `main` (no PRs / no feature branches unless asked)
- Never commit secrets (`.env`, `.env.secrets`, `recovery/`)
- No fallbacks / no cheating — see CLAUDE.md absolute rules
- ExecutionContext + transport-types are sacred; products contain zero infrastructure dirs (see CLAUDE.md)

## Verify done
- Local: API `:6700`, web `:6701`; Supabase REST/DB per current README (verify on disk)
- Public hosts when Studio up: https://enterprise.orchestratorai.io , https://app.orchestratorai.io
- `npm run lint|build|test` / `npm run dev:all` as documented

## Claude working directory
`cd /Users/golfergeek/projects/orchestratorai/orchestratorai-enterprise` then `~/.local/bin/claude -p "..."`

## Pointers
- CLAUDE.md, AGENTS.md, README.md, docs/, `.env.example`

## Deploying on the Mac Studio
Use  (= Deploying a415b5ac Add CODING.md (Coding Manager orientation) with the correct admin persona credentials
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'                                   
    CHECK (status IN ('draft', 'active', 'disabled', 'archived'))                                  
Try rerunning the command with --debug to troubleshoot the error.
#1 [internal] load local bake definitions
#1 reading from stdin 1.82kB done
#1 DONE 0.0s

#2 [platform-api internal] load build definition from nest-api.Dockerfile
#2 transferring dockerfile: 1.01kB done
#2 DONE 0.0s

#3 [platform-web internal] load build definition from vite-web.Dockerfile
#3 transferring dockerfile: 3.27kB done
#3 DONE 0.0s

#4 [platform-web] resolve image config for docker-image://docker.io/docker/dockerfile:1
#4 DONE 0.5s

#5 [platform-web] docker-image://docker.io/docker/dockerfile:1@sha256:ecfaec9ed6d810b56388c508f4121597bfbba70d41a6dfeee4d8cad5f295fc32
#5 resolve docker.io/docker/dockerfile:1@sha256:ecfaec9ed6d810b56388c508f4121597bfbba70d41a6dfeee4d8cad5f295fc32 done
#5 CACHED

#6 [platform-web internal] load metadata for docker.io/library/node:22-bookworm-slim
#6 DONE 0.3s

#7 [platform-web internal] load metadata for docker.io/library/nginx:1.27-alpine
#7 DONE 0.3s

#8 [platform-web internal] load .dockerignore
#8 transferring context: 580B done
#8 DONE 0.0s

#9 [platform-web build 1/7] FROM docker.io/library/node:22-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9
#9 resolve docker.io/library/node:22-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9 done
#9 DONE 0.0s

#10 [platform-web stage-1 1/3] FROM docker.io/library/nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10
#10 resolve docker.io/library/nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10 done
#10 DONE 0.0s

#11 [platform-api internal] load build context
#11 transferring context: 74.18kB 0.1s done
#11 DONE 0.1s

#12 [platform-web internal] load build context
#12 transferring context: 74.25kB 0.1s done
#12 DONE 0.1s

#13 [platform-web stage-1 2/3] COPY docker/nginx-platform-web.conf /etc/nginx/templates/default.conf.template
#13 CACHED

#14 [platform-web build 3/7] COPY package.json package-lock.json turbo.json ./
#14 CACHED

#15 [platform-web build 2/7] WORKDIR /app
#15 CACHED

#16 [platform-web build 4/7] COPY packages ./packages
#16 CACHED

#17 [platform-web build 5/7] COPY apps ./apps
#17 CACHED

#18 [platform-web build 6/7] RUN npm ci --no-audit --fund=false --loglevel=error
#18 CACHED

#19 [platform-web build 7/7] RUN npx turbo run build --filter="@orchestratorai/platform-web"
#19 CACHED

#20 [platform-web stage-1 3/3] COPY --from=build /app/apps/web/dist /usr/share/nginx/html
#20 CACHED

#21 [platform-api build 5/8] COPY apps ./apps
#21 CACHED

#22 [platform-api build 8/8] RUN npm prune --omit=dev --no-audit --fund=false --loglevel=error
#22 CACHED

#15 [platform-api build 2/7] WORKDIR /app
#15 CACHED

#23 [platform-api build 4/8] COPY packages ./packages
#23 CACHED

#24 [platform-api build 3/8] COPY package.json package-lock.json turbo.json ./
#24 CACHED

#25 [platform-api build 6/8] RUN npm ci --no-audit --fund=false --loglevel=error
#25 CACHED

#26 [platform-api build 7/8] RUN npx turbo run build --filter="@orchestratorai/platform-api"
#26 CACHED

#27 [platform-api runner 3/4] COPY --from=build /app /app
#27 CACHED

#28 [platform-api runner 4/4] WORKDIR /app/apps/api
#28 CACHED

#29 [platform-web] exporting to image
#29 exporting layers done
#29 exporting manifest sha256:10df97113a63169e472ab24b0ee766dc8e439ddb4c8fecb5f33f21b47db48dc5 done
#29 exporting config sha256:79be85bf15188960d6fb3b92582c30c641b19cdb26065eb414eaf607ecd06a0c done
#29 exporting attestation manifest sha256:57251b4e94999a0c928ac2ab6ba848e5d5e9e624b3f45c9554f0ab7d630c14e8 0.0s done
#29 exporting manifest list sha256:2785cd78aa472a1e895aa3d2d7ea6cfe91abd2c53a16c9b732f61b75e833fb6e done
#29 naming to docker.io/library/orchestratorai-enterprise-platform-web:latest done
#29 unpacking to docker.io/library/orchestratorai-enterprise-platform-web:latest done
#29 DONE 0.0s

#30 [platform-api] exporting to image
#30 exporting layers done
#30 exporting manifest sha256:c0753b69465fa0653783a3e18acf20dd48e23b5a8743f1f105808e302947c647 done
#30 exporting config sha256:438ea5dacebabf0158b189a5fac3fa21b5d7c6c6c97bdc2223d39c37f65d58ea done
#30 exporting attestation manifest sha256:069f82bcbe575f0c4654e63cd0494f30f731acc78e79873bb261551e6df93641 done
#30 exporting manifest list sha256:ba12850ce70cdb2f856ee6da20f5977d41f573584460e29a5224d784772a1038 done
#30 naming to docker.io/library/orchestratorai-enterprise-platform-api:latest done
#30 unpacking to docker.io/library/orchestratorai-enterprise-platform-api:latest done
#30 DONE 0.1s

#31 [platform-web] resolving provenance for metadata file
#31 DONE 0.0s

#32 [platform-api] resolving provenance for metadata file
#32 DONE 0.0s
Local deployed gateway is running at http://localhost:7777
Live: https://enterprise.orchestratorai.io (a415b5ac) / ): pulls main, migrates the local
Supabase, builds the images, recreates the :7777 stack, health-checks https://enterprise.orchestratorai.io.
Do not run bare  here — without the cloudflare overlay files the API gets the host-side
 database URL from  and crashes at startup ( is now overlay-aware).
