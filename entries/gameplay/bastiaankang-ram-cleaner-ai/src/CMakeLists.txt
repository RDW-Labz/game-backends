cmake_minimum_required(VERSION 3.16)
project(ram-cleaner-ai CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(ramcleanerai
    src/main.cpp
    src/monitor.cpp
    src/smart.cpp
    src/protect.cpp
)

target_include_directories(ramcleanerai PRIVATE include)

if(WIN32)
    target_link_libraries(ramcleanerai PRIVATE userenv)
endif()
