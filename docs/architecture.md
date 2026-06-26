# Architecture diagram

<!-- AUTO-GENERATED — do not edit by hand. Regenerated on every push by
     .github/workflows/architecture-diagram.yml. Run `npm run diagram:arch` to regenerate. Source of truth: the import graph itself. -->

High-level module dependency graph, collapsed to one box per top-level folder
(`app`, `components`, `lib`, `hooks`). An arrow means "imports from".

```mermaid
flowchart LR

subgraph 0["app"]
1["api"]
2["changes"]
3["cowork"]
4["globals.css"]
5["instructions"]
6["you"]
7["layout.tsx"]
8["page.tsx"]
9["prep"]
end
subgraph A["components"]
B["Board.tsx"]
C["ChangesView.tsx"]
D["CoWorkView.tsx"]
E["InstructionsEditor.tsx"]
F["NavRail.tsx"]
G["TodoView.tsx"]
H["board"]
I["prep"]
end
subgraph J["hooks"]
K["useApplications.ts"]
L["useFitQueue.ts"]
M["usePrep.ts"]
end
subgraph N["lib"]
O["agents"]
P["board.ts"]
Q["coerce.ts"]
R["config.ts"]
S["csv.ts"]
T["db"]
U["export.ts"]
V["format.ts"]
W["jobs"]
X["pipeline.ts"]
Y["prep"]
Z["types.ts"]
end
1-->T
1-->U
1-->W
1-->Z
1-->R
1-->O
2-->C
3-->D
5-->E
6-->G
7-->4
7-->F
8-->B
9-->I
9-->T
B-->H
B-->K
B-->L
B-->P
B-->X
B-->Z
C-->V
C-->Z
D-->O
D-->V
E-->1
H-->W
H-->P
H-->X
H-->Z
H-->L
I-->M
I-->T
I-->Y
K-->P
K-->X
K-->Z
L-->W
M-->T
O-->Z
O-->T
O-->Q
P-->X
P-->Z
T-->O
T-->Z
T-->Q
U-->O
U-->R
U-->T
W-->O
W-->R
W-->T
W-->U
W-->Z
W-->Q
X-->Z
Y-->T
```
