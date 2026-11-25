// settings.h — hot-reloadable runtime configuration.

#pragma once

#include <string>
#include <vector>

namespace ramoptimizerai {

struct Settings {
    std::string store_path{"~/.config/ram-optimizer-ai/state.json"};
    bool quiet{false};
    bool hot_reload{true};
    std::vector<std::string> watch_patterns;

    static Settings load_default();
    static Settings defaults();
    bool valid() const;
};

}  // namespace ramoptimizerai
