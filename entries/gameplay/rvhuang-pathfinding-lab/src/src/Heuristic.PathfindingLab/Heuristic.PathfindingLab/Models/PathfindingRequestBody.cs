using Newtonsoft.Json;

namespace Heuristic.PathfindingLab.Models
{
    public class PathfindingRequestBody
    {
        [JsonProperty(Required = Required.Always)]
        public int FromX { get; set; }

        [JsonProperty(Required = Required.Always)]
        public int FromY { get; set; }

        [JsonProperty(Required = Required.Always)]
        public int GoalX { get; set; }

        [JsonProperty(Required = Required.Always)]
        public int GoalY { get; set; }

        [JsonProperty(Required = Required.Always)]
        public int[][] Map { get; set; }

        [JsonProperty(Required = Required.Always)]
        public string[] Heuristics { get; set; }

        [JsonProperty(Required = Required.Always)]
        public string Algorithm { get; set; }

        public PathfindingSettings ToSettings()
        {
            return new PathfindingSettings()
            {
                Algorithm = Algorithm,
                FromX = FromX,
                FromY = FromY,
                GoalX = GoalX,
                GoalY = GoalY,
                Heuristics = Heuristics
            };
        }
    }
}