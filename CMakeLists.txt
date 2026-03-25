cmake_minimum_required(VERSION 3.21)
project(helm-audio VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# --- Dependencies ---
add_subdirectory(DaisySP)
add_subdirectory(DaisySP/DaisySP-LGPL)
# DaisySP-LGPL's relative include paths (../../Source) don't resolve correctly
# from this project layout — add the DaisySP Source and Utility paths it needs.
target_include_directories(DaisySP_LGPL PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/DaisySP/Source
    ${CMAKE_CURRENT_SOURCE_DIR}/DaisySP/Source/Utility
)
# DaisySP-LGPL uses size_t without including <cstddef>. Emscripten's libc++
# doesn't leak size_t into the global namespace, so force-include the header.
if(EMSCRIPTEN)
    target_compile_options(DaisySP_LGPL PRIVATE -include cstddef)
    target_compile_options(DaisySP PRIVATE -include cstddef)
endif()

# --- Engine library ---
add_library(helm_audio STATIC
    src/voice.cpp
    src/sequencer.cpp
    src/modulation.cpp
    src/synth.cpp
)
target_include_directories(helm_audio PUBLIC src/)
target_link_libraries(helm_audio PUBLIC DaisySP DaisySP_LGPL)

# --- WASM target ---
if(EMSCRIPTEN)
    add_executable(helm_engine src/worklet_bridge.cpp)
    target_link_libraries(helm_engine PRIVATE helm_audio)
    target_link_options(helm_engine PRIVATE
        --bind
        -sWASM=1
        -sSINGLE_FILE=1
        -sALLOW_MEMORY_GROWTH=1
        -sENVIRONMENT=worker
        -sEXPORT_ES6=1
        -sMODULARIZE=1
        -sNO_FILESYSTEM=1
        -sINITIAL_MEMORY=4194304
        -sEXPORTED_RUNTIME_METHODS=['HEAPF32']
        -sEXPORTED_FUNCTIONS=['_malloc','_free']
        --no-entry
    )
    set_target_properties(helm_engine PROPERTIES SUFFIX ".mjs")
endif()

# --- Native-only targets ---
if(NOT EMSCRIPTEN)
    include(FetchContent)

    FetchContent_Declare(doctest
        GIT_REPOSITORY https://github.com/doctest/doctest.git
        GIT_TAG v2.4.12
    )
    FetchContent_Declare(audiofile
        GIT_REPOSITORY https://github.com/adamstark/AudioFile.git
        GIT_TAG 1.1.2
    )
    FetchContent_MakeAvailable(doctest audiofile)

    # --- Tests ---
    add_executable(tests
        tests/test_voice.cpp
        tests/test_sequencer.cpp
        tests/test_modulation.cpp
        tests/test_effects.cpp
        tests/test_synth.cpp
    )
    target_link_libraries(tests PRIVATE helm_audio doctest::doctest)
    target_include_directories(tests PRIVATE ${audiofile_SOURCE_DIR})

    include(CTest)
    include(${doctest_SOURCE_DIR}/scripts/cmake/doctest.cmake)
    doctest_discover_tests(tests)

    # --- WAV renderer ---
    add_executable(render_wav
        tests/render_wav.cpp
    )
    target_link_libraries(render_wav PRIVATE helm_audio)
    target_include_directories(render_wav PRIVATE ${audiofile_SOURCE_DIR})
endif()
