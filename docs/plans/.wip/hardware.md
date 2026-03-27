# Hardware: Daisy Seed tracker

A standalone hardware tracker running the helm-audio engine on an Electro-smith Daisy Seed. Same C++ engine, same binary protocol, same display model — different platform.

This is a future possibility, not a current priority. Documenting it now because the architectural decisions we're making in the browser version (engine/display separation, binary protocol, display list rendering, M8-style input model) are exactly the decisions that make a hardware version viable. Every design choice that keeps the engine decoupled from the browser makes the hardware path shorter.

## Why it would work

The engine is built on DaisySP, which was designed for the Daisy platform. Every DSP module we use (Oscillator, Svf, Adsr, DelayLine, ReverbSc, Chorus, Overdrive) ships with DaisySP and runs on the Daisy's Cortex-M7 at 480MHz. The voice, sequencer, modulation system, and effect buses are pure C++ with no browser dependencies. They compile natively today for testing — they'd compile for the Daisy the same way.

The M8 tracker runs on a Teensy 4.1 (Cortex-M7 at 600MHz) with 4-op FM synthesis, 8 tracks, effects, and a sequencer. Our engine is lighter (2-op FM, similar track count), so it would fit comfortably on the Daisy Seed with room to grow.

## Hardware

### Daisy Seed

- **MCU:** STM32H750 — ARM Cortex-M7 at 480MHz
- **RAM:** 64MB SDRAM + 512KB internal SRAM
- **Audio:** Built-in AK4556 codec, 24-bit, 48kHz (or 96kHz), stereo in/out
- **Storage:** No built-in SD — needs an external SD card breakout or SPI flash
- **GPIO:** 31 pins — enough for buttons, encoder, display, SD card
- **Size:** 48mm × 18mm
- **Cost:** ~$30
- **Power:** USB-C (5V) or external supply

The Daisy Seed is a module, not a finished board. It plugs into a carrier board that provides the buttons, display, jacks, and power. Electro-smith sells the Daisy Pod (4 knobs, 2 buttons, 2 encoders) and Daisy Patch (4 CV in, 4 audio in/out, OLED), but for a tracker we'd want a custom carrier board.

### Display

An SPI LCD, 320×240 or 320×480, ILI9341 or ST7789 controller. The M8 uses a 320×240 IPS display. Same character grid (40×25 at 8×10 pixel cells), same bitmap font, same rendering model — the display driver sends characters and rectangles to the LCD instead of to WebGL.

The Daisy Seed's SPI runs at up to 50MHz. A full 320×240 16-bit framebuffer is 150KB — fits in SDRAM. Full screen refresh at 30fps is 4.5MB/s, well within SPI bandwidth. Partial updates (only redraw changed rows) reduce this further.

DaisySP's `DaisySeed` class provides SPI helpers. There are existing ILI9341 drivers for STM32 that would need minor adaptation.

### Input

Minimal input matching the M8 model:

- **D-pad:** 4 directional buttons (up/down/left/right)
- **Action buttons:** 4 buttons (Edit, Option, Shift, Start/Stop)
- **Total:** 8 buttons, directly wired to GPIO pins

This is the same 8-button layout the M8 uses. Every interaction in our UI is designed for this — direction keys navigate, Edit+direction changes values, Shift+direction changes pages. No keyboard, no mouse, no touch screen.

Optional additions:
- **Rotary encoder** — fast value scrolling (replaces repeated Edit+Up/Down presses)
- **MIDI in/out** — DIN or TRS, using the Daisy Seed's UART pins
- **Audio input** — the Daisy codec has stereo input, could be used for sampling or external processing

### Storage

An SD card via SPI for saving/loading songs, patches, and patterns. The binary protocol encoding (`encodePatchBank`, `encodePattern`, `encodeBusConfig`) produces the exact byte format that would be written to files. Loading is the reverse — read bytes from a file, pass them to `ProtocolDecoder::Decode()`.

File format would be a simple container: a header with version and section offsets, followed by the binary-encoded patch bank, pattern chain, and bus config. The same format could be loaded by the browser version — drag a `.helm` file onto the web tracker, it sends the binary sections to the worklet.

## What changes from the browser version

### Nothing in the engine

`Synth::Init()`, `Synth::Process()`, `ProtocolDecoder::Decode()` — identical code. The engine doesn't know what platform it's on. It processes audio buffers and responds to binary messages.

### Audio output

**Browser:** AudioWorklet calls `synth.Process(left, right, 128)` per render quantum, copies samples to Web Audio output buffers.

**Daisy:** The audio callback calls `synth.Process(left, right, blockSize)` directly. No worklet, no WASM, no thread boundary. The Daisy's HAL handles DMA transfer to the codec.

```cpp
void AudioCallback(float** in, float** out, size_t size) {
    synth.Process(out[0], out[1], size);
}
```

This is simpler than the browser path. One function call in the audio interrupt.

### Display

**Browser:** View builder produces `DrawChar[]` and `DrawRect[]` arrays → WebGL renderer draws instanced quads to an offscreen framebuffer → blit to canvas.

**Daisy:** View builder produces the same draw commands → SPI display driver writes characters and rectangles to the LCD framebuffer → DMA transfer to the display.

The view builder code (what to draw on each page) is platform-independent. The only platform-specific code is the display driver — ~200 lines of SPI commands to init the LCD and blit pixels.

The bitmap font atlas is the same PNG, converted to a C array (same as m8c's `font1.h`). Character rendering is a memcpy from the font atlas to the framebuffer at the character's grid position.

### Input

**Browser:** `document.addEventListener('keydown', ...)` → key handler → state mutations.

**Daisy:** GPIO polling in the main loop → same key handler → same state mutations.

The key handler function itself is identical. The only difference is where the key events come from.

### Binary protocol

Same format, different transport:

- **Browser:** `ArrayBuffer` via `MessagePort.postMessage(buf, [buf])`
- **Daisy:** Bytes read from SD card, or received over UART/USB serial
- **Shared:** File save/load uses the same binary encoding in both contexts

## Build system

The Daisy toolchain is `arm-none-eabi-gcc` with Electro-smith's `libDaisy` HAL library. CMake supports cross-compilation with a toolchain file. We'd add a `daisy` preset to `CMakePresets.json` alongside `native-debug`, `native-release`, and `wasm`:

```json
{
    "name": "daisy",
    "displayName": "Daisy Seed (ARM Cortex-M7)",
    "generator": "Ninja",
    "binaryDir": "${sourceDir}/build/daisy",
    "toolchainFile": "${sourceDir}/lib/libDaisy/cmake/toolchain.cmake",
    "cacheVariables": {
        "CMAKE_BUILD_TYPE": "Release"
    }
}
```

The engine library (`helm_audio`) compiles unchanged. The Daisy target links against `libDaisy` for hardware abstraction and adds platform-specific files for the display driver, input handler, and main loop.

## What this means for current development

No action needed now. But these choices in the browser version pay off later:

- **Engine has no browser dependencies.** Pure C++ with DaisySP. Compiles for any target.
- **Binary protocol is transport-agnostic.** Same bytes over MessagePort, UART, SPI, or file I/O.
- **Display list model separates view logic from rendering.** The view builder (what to draw) is shared. Only the renderer (how to draw it) is platform-specific.
- **M8-style 8-button input model.** The UI is designed for minimal input. A full keyboard is a superset — everything that works with 8 buttons works with a keyboard.
- **40×25 character grid at 320×250 native resolution.** Fits on a small SPI LCD with no scaling needed.

Every time we make a decision that keeps the engine, protocol, or view logic independent of the browser, the hardware path gets shorter.
