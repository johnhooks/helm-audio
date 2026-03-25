EMSDK_ENV := ../emsdk/emsdk_env.sh
LOCAL_PUBLIC := packages/local/public

# --- Native ---

.PHONY: native
native:
	cmake --preset native-debug
	cmake --build build/native-debug

.PHONY: native-release
native-release:
	cmake --preset native-release
	cmake --build build/native-release

.PHONY: test
test: native
	ctest --test-dir build/native-debug --output-on-failure

.PHONY: render
render: native
	cd build/native-debug && mkdir -p tmp && ./render_wav

# --- WASM ---

.PHONY: wasm
wasm:
	source $(EMSDK_ENV) && cmake --preset wasm && cmake --build build/wasm

# --- JS/TS ---

.PHONY: check
check:
	bun run check

.PHONY: test-ts
test-ts:
	bun run test

# --- Local dev ---

.PHONY: dev-assets
dev-assets: wasm
	cd packages/worklet && bun run build
	mkdir -p $(LOCAL_PUBLIC)
	cp packages/worklet/dist/processor.js $(LOCAL_PUBLIC)/processor.js

.PHONY: dev
dev: dev-assets
	cd packages/local && bun run dev

# --- Cleanup ---

.PHONY: clean
clean:
	rm -rf build/native-debug build/native-release build/wasm
	rm -rf packages/local/public/processor.js
