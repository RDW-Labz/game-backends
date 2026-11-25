// helpers.cpp — part of ram-optimizer-ai.

#include "ramoptimizerai/helpers.h"

#include <cstdio>

namespace ramoptimizerai {

Helpers::Helpers(const std::string& config_path)
    : config_path_(config_path) {}

void Helpers::configure(const std::string& key, const std::string& value) {
    if (key == "verbose") verbose_ = (value == "true");
}

bool Helpers::run() {
    if (verbose_) std::fprintf(stderr, "[ram-optimizer-ai] helpers: run\n");
    // core logic lives here
    return true;
}

}  // namespace ramoptimizerai
