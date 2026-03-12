cmake_minimum_required(VERSION 3.21)
project(helm-audio VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# --- Dependencies ---
add_subdirectory(DaisySP)

# --- Engine library ---
add_library(helm_audio STATIC
    src/voice.cpp
    src/sequencer.cpp
)
target_include_directories(helm_audio PUBLIC src/)
target_link_libraries(helm_audio PUBLIC DaisySP)

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
