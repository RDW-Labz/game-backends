cmake_minimum_required(VERSION 3.16)
project(ram-optimizer-ai CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(ramoptimizerai
    src/main.cpp
    src/monitor.cpp
    src/smart.cpp
    src/protect.cpp
    src/cli.cpp
    src/helpers.cpp
)

target_include_directories(ramoptimizerai PRIVATE include)

if(WIN32)
    target_link_libraries(ramoptimizerai PRIVATE userenv)
endif()
