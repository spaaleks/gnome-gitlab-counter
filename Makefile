UUID = gitlabcounter@spaaleks.com
EXT_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

# Detect GNOME Shell major version. Falls back to 0 if gnome-shell is missing.
GNOME_MAJOR ?= $(shell gnome-shell --version 2>/dev/null | awk '{print $$3}' | cut -d. -f1)

# GNOME Shell <= 44 uses the legacy imports.* API + Soup 2.4.
# GNOME Shell >= 45 uses ESM modules + Soup 3.
ifeq ($(shell test "$(GNOME_MAJOR)" -le 44 2>/dev/null && echo yes),yes)
EXT_SRC = extension-legacy.js
PREFS_SRC = prefs-legacy.js
API = legacy
else
EXT_SRC = extension.js
PREFS_SRC = prefs.js
API = esm
endif

.PHONY: all install schemas enable disable prefs logs uninstall info

all: schemas

info:
	@echo "Detected GNOME Shell major: $(GNOME_MAJOR)"
	@echo "API variant:                $(API)"
	@echo "extension.js source:        $(EXT_SRC)"
	@echo "prefs.js source:            $(PREFS_SRC)"

schemas: schemas/gschemas.compiled

schemas/gschemas.compiled: schemas/org.gnome.shell.extensions.glcounter.gschema.xml
	glib-compile-schemas schemas/

install: schemas
	@if [ -z "$(GNOME_MAJOR)" ] || [ "$(GNOME_MAJOR)" = "0" ]; then \
		echo "Could not detect GNOME Shell version. Pass GNOME_MAJOR=NN."; \
		exit 1; \
	fi
	@echo "Installing $(API) variant for GNOME Shell $(GNOME_MAJOR)"
	mkdir -p $(EXT_DIR)
	cp metadata.json stylesheet.css labels.json $(EXT_DIR)/
	cp -r schemas icons $(EXT_DIR)/
	cp $(EXT_SRC) $(EXT_DIR)/extension.js
	cp $(PREFS_SRC) $(EXT_DIR)/prefs.js
	rm -rf $(EXT_DIR)/lib
	if [ "$(API)" = "esm" ]; then cp -r lib $(EXT_DIR)/; fi

enable:
	gnome-extensions enable $(UUID)

disable:
	gnome-extensions disable $(UUID)

prefs:
	gnome-extensions prefs $(UUID)

logs:
	journalctl -f -o cat /usr/bin/gnome-shell

uninstall:
	rm -rf $(EXT_DIR)

GNOMES := 42 43 44 45 46 47 48 49 50

.PHONY: build-all test-all pull push clean-tests visual-diff zip lint-zip

build-all: $(addprefix build-,$(GNOMES))
test-all: $(addprefix test-,$(GNOMES))

pull:
	./bin/pull-images.sh

push:
	./bin/push-images.sh

build-%:
	./bin/build-image.sh $*

test-%:
	./bin/test-version.sh $*

visual-diff:
	./bin/visual-diff.sh

zip:
	./bin/build-ego-zip.sh

lint-zip: zip
	./bin/lint-zip.sh

visual-diff-%:
	./bin/visual-diff.sh $*

clean-tests:
	rm -rf tmp/
	podman rmi $(addprefix gnome-ext-test:,$(GNOMES)) 2>/dev/null || true
