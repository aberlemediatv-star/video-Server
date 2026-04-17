SHELL := /bin/bash
ROOT := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
VOD_DEMO := $(ROOT)data/vod/demo

.PHONY: scripts-executable transcode package publish-demo phase-a help

help:
	@echo "Targets:"
	@echo "  make scripts-executable   chmod +x scripts/*.sh"
	@echo "  make phase-a INPUT=./clip.mp4   Phase-A E2E (Transcode→Package→demo→API)"
	@echo "  make transcode INPUT=./clip.mp4   -> data/work/rend"
	@echo "  make package REND=data/work/rend PKG=data/work/pkg"
	@echo "  make publish-demo         copy data/work/pkg -> $(VOD_DEMO) (nginx /vod/demo/)"

scripts-executable:
	chmod +x "$(ROOT)scripts/"*.sh

transcode: scripts-executable
	@test -n "$(INPUT)" || (echo "Set INPUT=path/to.mp4" >&2 && exit 1)
	@mkdir -p "$(ROOT)data/work/rend"
	"$(ROOT)scripts/transcode_abr.sh" "$(INPUT)" "$(ROOT)data/work/rend"

package: scripts-executable
	@test -n "$(REND)" || (echo "Set REND=path/to/renditions" >&2 && exit 1)
	@test -n "$(PKG)" || (echo "Set PKG=path/to/out" >&2 && exit 1)
	"$(ROOT)scripts/package_cmaf.sh" "$(REND)" "$(PKG)"

publish-demo:
	@mkdir -p "$(VOD_DEMO)"
	@test -d "$(ROOT)data/work/pkg" || (echo "Run make package REND=... PKG=data/work/pkg first" >&2 && exit 1)
	rsync -a --delete "$(ROOT)data/work/pkg/" "$(VOD_DEMO)/"
	@echo "Published to $(VOD_DEMO) — URLs: http://localhost:8080/vod/demo/master.m3u8 und .../manifest.mpd"

phase-a: scripts-executable
	@test -n "$(INPUT)" || (echo "Set INPUT=path/to.mp4" >&2 && exit 1)
	"$(ROOT)scripts/phase_a_vod.sh" "$(INPUT)"
