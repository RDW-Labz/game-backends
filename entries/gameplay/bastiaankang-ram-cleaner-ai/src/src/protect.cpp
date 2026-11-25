// protect.cpp — part of ram-cleaner-ai.

#include "ramcleanerai/protect.h"

#include <cstdio>

namespace ramcleanerai {

Protect::Protect(const std::string& config_path)
    : config_path_(config_path) {}

void Protect::configure(const std::string& key, const std::string& value) {
    if (key == "verbose") verbose_ = (value == "true");
}

bool Protect::run() {
    if (verbose_) std::fprintf(stderr, "[ram-cleaner-ai] protect: run\n");
    // core logic lives here
    return true;
}

}  // namespace ramcleanerai
