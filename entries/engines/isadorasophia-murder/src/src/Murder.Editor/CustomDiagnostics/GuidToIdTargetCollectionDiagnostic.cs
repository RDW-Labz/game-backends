using Murder.Assets;
using Murder.Components;
using Murder.Diagnostics;
using Murder.Editor.CustomEditors;
using Murder.Prefabs;

namespace Murder.Editor.CustomDiagnostics;

[CustomDiagnostic(typeof(GuidToIdTargetCollectionComponent))]
public class GuidToIdTargetCollectionDiagnostic : ICustomDiagnostic
{
    public bool Propagate => false;

    public bool IsValid(string identifier, in object target, bool outputResult)
    {
        if (target is null)
        {
            return true;
        }

        if (Architect.Instance.ActiveScene is not EditorScene editorScene ||
            editorScene.EditorShown is not CustomEditor editor)
        {
            return true;
        }

        if (Game.Data.TryGetAsset(editor.WorldReference) is not WorldAsset world)
        {
            return true;
        }

        GuidToIdTargetCollectionComponent guidToId = (GuidToIdTargetCollectionComponent)target;
        foreach (GuidId id in guidToId.Collection)
        {
            if (world.TryGetInstance(id.Target) is not EntityInstance)
            {
                if (outputResult)
                {
                    GameLogger.Warning($"\uf071 Found missing reference of '{id.Id}' to {id.Target}.");
                }

                return false;
            }
        }

        return true;
    }
}
