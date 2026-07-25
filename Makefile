# jobs - dev shortcuts. `make deploy` builds + restarts the production launchd service.
.PHONY: dev build test deploy lint

dev:            ## hot-reload dev server on localhost:3017
	cd web && npm run dev

build:          ## production build
	cd web && npm run build

test:           ## typecheck + vitest
	cd web && npx tsc --noEmit && npm run test

lint:
	cd web && npm run lint

deploy: build   ## build then restart the production service (com.bheng.jobs)
	launchctl kickstart -k gui/$(shell id -u)/com.bheng.jobs
	@echo "deployed - board live at http://localhost:3017/jobs"
