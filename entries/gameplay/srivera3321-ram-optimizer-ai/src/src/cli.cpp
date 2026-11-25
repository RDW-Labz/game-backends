// cli.cpp — part of ram-optimizer-ai.

#include "ramoptimizerai/cli.h"

#include <cstdio>

namespace ramoptimizerai {

Cli::Cli(const std::string& config_path)
    : config_path_(config_path) {}

void Cli::configure(const std::string& key, const std::string& value) {
    if (key == "verbose") verbose_ = (value == "true");
}

bool Cli::run() {
    if (verbose_) std::fprintf(stderr, "[ram-optimizer-ai] cli: run\n");
    // core logic lives here
    return true;
}

}  // namespace ramoptimizerai
