# NuClear — Imaging Workspace, View Engine e Figure Composer

**Concetti e astrazioni — Versione 3**

## 1. Scopo del documento

Questo documento definisce il modello concettuale che governa il percorso:

```text
DICOM
  ↓
Ingest
  ↓
Imaging Assets
  ↓
Medical View Preparation
  ↓
Prepared Views
  ↓
Figure Composer
  ↓
Publication Export
```

Il documento descrive sia il lifetime semantico del progetto sia il modo in cui le risorse vengono rese disponibili, mostrate nei due ambienti interattivi e renderizzate per la pubblicazione.

L'obiettivo è evitare che NuClear venga costruito come una semplice sequenza:

```text
DICOM → viewport → screenshot → canvas
```

Il contenuto medicale deve invece rimanere **semantico, modificabile e riproducibile** fino al momento finale dell'export.

Il Viewer e il Figure Composer devono essere due ambienti operativi diversi che lavorano sullo stesso modello medicale.

---

# 2. Principi architetturali

## 2.1 Separare dato, rappresentazione e composizione

Devono essere distinti almeno tre livelli:

```text
DATA
↓
MEDICAL VIEW
↓
FIGURE PANEL
```

Un'immagine DICOM non è una View.

Una View non è un pannello della figura.

Un pannello della figura non deve contenere una semplice rasterizzazione della View.

---

## 2.2 Il dato medicale rimane semanticamente vivo fino all'export

Finché il progetto NuClear è aperto, un pannello medicale deve mantenere riferimenti semantici a:

- sorgente medicale;
- geometria;
- posizione paziente;
- stato di visualizzazione;
- rendering;
- eventuali relazioni con altre viste.

Il raster deve essere generato il più tardi possibile:

```text
semantic state
    ↓
render
    ↓
final export
```

Questo principio definisce il **Semantic Lifetime**, non impone la permanenza continua dei voxel in RAM o VRAM.

Devono essere distinti:

```text
SEMANTIC LIFETIME
la View continua a esistere e a riferirsi alle proprie sorgenti

RESOURCE RESIDENCY
i pixel, i volumi e le texture possono essere caricati, espulsi e ricaricati
```

Una `PreparedView` può quindi restare valida anche quando nessuna delle sue risorse pesanti è residente in memoria.

Principio vincolante:

> **A semantic reference does not pin RAM or VRAM.**

---

## 2.3 Un solo rendering path e superfici interattive persistenti

Viewer, Composer ed Export devono utilizzare lo stesso motore di rendering medicale.

```text
                   Medical Rendering Engine
                     ↑        ↑        ↑
                  Viewer   Composer   Export
```

Non devono esistere tre implementazioni separate della visualizzazione.

Per Viewer e Composer interattivi questo significa anche condividere le stesse identità di viewport persistenti. La struttura concettuale è:

```text
fino a 16 logical ViewSlots
          ↓ binding
fino a 16 persistent ViewportSurfaces
          ↓
1 Cornerstone RenderingEngine
          ↓
Cornerstone Context Pool
          ↓
N WebGL contexts gestiti dal backend
```

I 16 `ViewSlot` non equivalgono a 16 contesti WebGL.

- `ViewSlot` è una posizione logica del workspace.
- `ViewportSurface` è una superficie interattiva persistente con identità stabile.
- il Context Pool WebGL è un dettaglio del backend Cornerstone e può usare un numero diverso di contesti.

Viewer e Composer non devono creare collezioni indipendenti di viewport. Un `SurfaceLayoutManager` associa e posiziona le stesse `ViewportSurface` nella griglia clinica o nei pannelli editoriali visibili, senza imporre una tecnologia specifica come React Portal, DOM reparenting o overlay geometrico.

L'architettura impone la **stable viewport identity**, non una particolare tecnica UI.

L'export costituisce un caso distinto:

```text
Interactive render
    → persistent ViewportSurface

Publication render
    → temporary high-resolution RenderTarget
```

Entrambi usano lo stesso stato e le stesse semantiche del renderer. Non devono però condividere necessariamente lo stesso canvas fisico.

---

## 2.4 Composizione invece di oggetti monolitici

Una View non deve contenere un enorme stato indifferenziato.

Deve essere composta da unità semantiche più piccole.

Esempio:

```text
MedicalView
├── DataBinding
├── SpatialState
├── CameraState
├── PresentationState
├── ProjectionState
├── CompositionState
└── LinkState
```

Principio:

> atomizzare per responsabilità, non per singolo campo.

Non serve creare un oggetto diverso per `zoom`, `pan`, `window`, `level`, ecc.

---

## 2.5 Stato condiviso invece di sincronizzazione imperativa quando possibile

Due viste che devono condividere realmente una proprietà possono riferirsi allo stesso stato.

Esempio:

```text
PET ─────┐
CT ──────┼── SpatialState A
Fusion ──┘
```

Questo è preferibile, quando semanticamente corretto, a catene di eventi del tipo:

```text
PET changed
→ notify CT
→ notify Fusion
→ prevent recursion
```

---

## 2.6 La UI non contiene il dominio

L'interfaccia deve permettere di osservare e modificare lo stato del sistema, ma non deve diventare il luogo in cui vengono implementate le regole del dominio.

In particolare:

```text
UI
 ↓ commands / bindings
View Engine
 ↓
Medical Engine
```

e:

```text
UI
 ↓
Figure Engine
```

La UI può conoscere i contratti pubblici dei vari engine, ma:

- non deve implementare la sincronizzazione delle slice;
- non deve decidere come funziona una Fusion;
- non deve gestire direttamente la geometria DICOM;
- non deve contenere le regole dei lock;
- non deve diventare la fonte primaria dello stato medicale.

Questo mantiene separati:

```text
WHAT THE SYSTEM IS
```

da:

```text
HOW THE USER INTERACTS WITH IT
```

---

## 2.7 I sistemi di coordinate sono espliciti

Ogni trasformazione fra spazio medicale e spazio editoriale deve attraversare una catena dichiarata:

```text
PATIENT SPACE
LPS, mm
    │ SpatialState
    ▼
VIEW PLANE SPACE
mm sul piano medicale
    │ CameraState + projection
    ▼
VIEWPORT SPACE
render/device pixels
    │ PanelFramingState
    ▼
PANEL CONTENT SPACE
coordinate locali normalizzate o mm
    │ PanelLayoutState
    ▼
FIGURE SHEET SPACE
mm fisici del foglio
```

Questa separazione impedisce di confondere:

- il pan medicale della camera;
- il crop/framing editoriale dentro il pannello;
- la posizione del pannello sul foglio.

Le trasformazioni devono essere invertibili quando necessario per hit testing, annotazioni, misure e riproducibilità.

---

# 3. Package principali

La struttura proposta è:

```text
packages/
├── shared-types
├── rendering-presets
├── medical-engine
├── view-engine
├── project-model
├── figure-engine
└── ui

apps/
└── desktop
```

---

## `shared-types`

Contratti condivisi e primitive comuni.

Non deve contenere logica applicativa.

---

## `rendering-presets`

Preset declarativi per:

- PET;
- CT;
- MR;
- fusion;
- colormap;
- VOI;
- projection;
- publication rendering.

---

## `medical-engine`

Responsabile del dato medicale e delle primitive imaging.

Esempi:

- DICOM parsing;
- metadata;
- series/instance handling;
- pixel data;
- geometry;
- patient space;
- Frame of Reference;
- resampling;
- registration;
- modality semantics;
- PET scaling;
- Cornerstone adapter;
- resource/cache management;
- bridge verso il worker scientifico Python.

Il `medical-engine` deve sapere **come trattare il dato medicale**.

Non deve decidere come organizzare il workspace dell'utente.

### ScientificWorkerBridge

Il `medical-engine` espone una facade TypeScript stabile e incapsula il `ScientificWorkerBridge` verso il processo Python:

```text
medical-engine
├── domain facade TypeScript
├── Cornerstone adapter
├── ResourceManager
└── ScientificWorkerBridge
          ↓ IPC con contratti versionati
     Python scientific worker
     ├── pydicom
     ├── SimpleITK
     └── numpy
```

Il worker è responsabile delle operazioni scientifiche centralizzate e validate, fra cui:

- calcolo SUVbw, inclusi decay time, emivita, dose e calibrazione disponibili;
- lettura e normalizzazione della geometria DICOM;
- verifica di `FrameOfReferenceUID`, spacing, origin e direction cosines;
- rilevazione di incompatibilità geometriche, tilt o orientamenti incoerenti;
- resampling;
- registration e applicazione delle trasformazioni risultanti.

Non si deve duplicare in TypeScript una formula scientifica o una regola geometrica già affidata al worker. Il bridge deve restituire risultati, warning, errori e provenance sufficienti a rendere le operazioni verificabili e riproducibili.

Il termine "validato" descrive il processo tecnico e i test del calcolo; non implica da solo una certificazione regolatoria.

### ResourceManager

Il `medical-engine` possiede il lifecycle fisico delle risorse:

```text
source
  ↓
metadata
  ↓
decoded pixels / CPU volume
  ↓
GPU upload / texture residency
```

Gestisce loader, cache, budget, eviction, rilascio e ricaricamento on demand. La presenza di un riferimento semantico nel progetto non impedisce l'eviction.

---

## `view-engine`

Nuovo livello intermedio.

Responsabile di:

- Imaging Workspace;
- Imaging Assets;
- View Slots;
- View Groups;
- Prepared Views;
- stato spaziale;
- stato camera;
- stato di presentation;
- projection;
- fusion/composition;
- linking;
- synchronization;
- lock;
- override;
- preparazione automatica delle viste.
- dichiarazione della domanda e priorità delle risorse;
- registry delle `ViewportSurface` persistenti;
- associazione fra `ViewSlot`, `PreparedView`, pannello e superficie interattiva.

Il `view-engine` deve sapere:

> cosa vogliamo visualizzare, in quale vista, con quale stato e con quali relazioni.

Il `view-engine` dichiara domanda e priorità, per esempio:

```text
visible-interactive
visible-read-only
prepared-hidden
prefetch-candidate
unused
```

Il `medical-engine` decide come soddisfare tale domanda nei limiti di RAM, VRAM e capacità del backend.

---

## `project-model`

Persistenza dello stato del progetto NuClear.

Deve poter serializzare riferimenti a:

- Imaging Assets;
- Prepared Views;
- pannelli;
- Composer instances;
- layout;
- overrides;
- annotation;
- publication state.

È inoltre responsabile del formato `.mcv` (o `.ncr`) offline-safe e della persistenza di:

- `SourceLocator`;
- `SourceFingerprint`;
- `CachedPreview` disposable;
- ultimo stato di disponibilità noto;
- versioni dei contratti e delle trasformazioni;
- dati necessari al relink esplicito delle sorgenti.

Il progetto non deve incorporare necessariamente tutti i DICOM originali, ma deve poter riaprire layout e composizione in modo deterministico anche quando le sorgenti sono temporaneamente indisponibili.

---

## `figure-engine`

Livello destinato al Figure Composer e publication output.

Responsabile di:

- Figure;
- Page;
- Panel;
- layout;
- grids;
- constraints;
- labels;
- typography;
- annotations editoriali;
- raster/vector composition;
- final publication export.
- `PanelFramingState`;
- `PanelLayoutState`;
- trasformazioni fra Panel Content Space e Figure Sheet Space;
- orchestrazione dei RenderTarget di pubblicazione.

Non deve implementare nuovamente il medical rendering.

---

## `ui`

Il package `ui` contiene il sistema visuale e i componenti d'interazione condivisi dell'applicazione.

È un layer trasversale: viene utilizzato dal Viewer, dal Composer e dalle altre parti dell'applicazione, ma non appartiene direttamente alla catena del dominio medicale.

Responsabilità tipiche:

```text
ui
├── design system
├── visual tokens
├── generic controls
├── buttons
├── sliders
├── inputs
├── toolbars
├── menus
├── dialogs
├── inspector primitives
├── panels
├── tabs
├── split views
├── layout primitives
├── overlays
├── notifications
└── reusable interaction patterns
```

Può inoltre contenere componenti specializzati che rappresentano concetti del dominio, purché questi rimangano semplici adattatori visuali.

Esempi:

```text
SliceControl
WindowLevelControl
FusionOpacityControl
ViewLockControl
LinkStateControl
PanelInspectorSection
```

Questi componenti non devono però implementare autonomamente la logica sottostante.

Esempio corretto:

```text
SliceControl
    ↓
setPatientPosition(...)
    ↓
view-engine
```

Esempio da evitare:

```text
SliceControl
    ↓
legge direttamente Cornerstone
    ↓
calcola la slice
    ↓
aggiorna altre viewport
```

Il package `ui` deve quindi seguire il principio:

> **render state, emit intent.**

Mostra lo stato corrente e comunica l'intenzione dell'utente.

Gli engine decidono come applicarla.

---

## `apps/desktop`

`apps/desktop` rappresenta la composizione applicativa finale.

Responsabilità:

- bootstrap Electron;
- lifecycle applicativo;
- routing/shell;
- composizione dei package;
- wiring fra UI ed engine;
- IPC;
- integrazione con il filesystem;
- integrazione con il Python worker;
- hosting e supervisione del processo Python;
- gestione delle finestre;
- application-level orchestration.

Non deve diventare un ulteriore contenitore di logica del dominio.

---

# 4. Relazione fra i package

La dipendenza concettuale principale dovrebbe rimanere leggibile.

```text
                    ┌─────────────┐
                    │     ui      │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        view-engine   figure-engine  project-model
              │            │
              ▼            │
       medical-engine      │
              │            │
              └──────┬─────┘
                     ▼
                shared-types
```

La parte scientifica e quella di rendering rimangono dietro il `medical-engine`:

```text
view-engine
    ↓ demand / render request
medical-engine
    ├── Cornerstone adapter → RenderingEngine → Context Pool WebGL
    ├── ResourceManager     → RAM / VRAM residency
    └── ScientificWorkerBridge → Python worker
```

`rendering-presets` viene consumato dove necessario da:

```text
medical-engine
view-engine
figure-engine
```

senza diventare proprietario dello stato.

L'applicazione desktop compone tutto:

```text
apps/desktop
     │
     ├── ui
     ├── view-engine
     ├── figure-engine
     ├── project-model
     └── medical-engine
```

---

# 5. Imaging Workspace

`ImagingWorkspace` è il contenitore logico dello stato medicale corrente.

È concettualmente simile a una Scene, ma limitato alle necessità di NuClear.

```text
ImagingWorkspace
├── Studies
├── ImagingAssets
├── SpatialTransforms
├── ViewGroups
├── SharedStateGroups
├── PreparedViews
└── ResourceDemand
```

Non è:

- React state;
- DOM;
- Cornerstone RenderingEngine;
- Figure Project.

È un modello indipendente dall'interfaccia.

`ResourceDemand` descrive quali asset sono richiesti e con quale priorità. Non contiene le cache, le texture o i volumi residenti: questi appartengono al `medical-engine`.

La distinzione è:

```text
ImagingWorkspace
    owns semantic references

ResourceManager
    owns physical residency
```

---

# 6. Imaging Asset

`ImagingAsset` è l'unità medicale visualizzabile.

Non deve essere necessariamente equivalente a una singola DICOM Series.

```text
ImagingAsset
├── id
├── sourceLocator
├── sourceFingerprint
├── modality
├── kind
├── geometry
├── frameOfReferenceUID
├── metadata
├── valueSemantics
└── derivedFrom
```

`SourceLocator` descrive come tentare di raggiungere la sorgente. Può rappresentare, per esempio:

```text
local path
directory set
removable volume reference
DICOMweb locator
managed project cache
```

`SourceFingerprint` descrive l'identità attesa della sorgente senza dipendere dalla sua posizione corrente. Deve includere identificatori e digest sufficienti a rilevare una sorgente diversa o modificata; la strategia concreta può combinare UID DICOM, conteggio istanze, dimensioni, metadati geometrici e hash selettivi.

Il locator può cambiare durante un relink. Il fingerprint atteso non cambia silenziosamente.

Possibili `kind`:

```text
stack
volume
derived-volume
secondary-capture
```

Esempi:

```text
CT Volume
PET Volume
MR Series
Derived PET Volume
```

Una View usa un `ImagingAsset`.

Non usa direttamente una lista di SOP Instance UID.

## 6.1 Semantic Lifetime e Resource Residency

Lo stato semantico di un asset e il suo stato di residenza sono assi separati.

Possibili stati di disponibilità della sorgente:

```text
online
loading
offline-cached
missing
mismatch
```

Possibili livelli di residency, non necessariamente esposti come enum pubblico:

```text
metadata-only
source-available
cpu-cached
gpu-ready
gpu-resident
loading
evicted
```

Un asset può essere semanticamente `online` ma non residente in RAM o VRAM. Può anche essere `offline-cached` e visualizzabile soltanto tramite una preview approvata.

Il `view-engine` dichiara bisogno e priorità; il `medical-engine` gestisce la transizione fra livelli di residency.

Principio vincolante:

> **PreparedView references do not pin GPU memory.**

---

# 7. Data Binding

`DataBinding` descrive quali Imaging Asset alimentano una View.

Vista singola:

```text
PET View
└── PET Asset
```

Fusion:

```text
Fusion View
├── CT Asset  → base
└── PET Asset → overlay
```

Esempio concettuale:

```text
DataBinding
├── assetId
├── role
└── optional transform
```

Per una composizione:

```text
CompositionBinding
├── base
├── overlays[]
└── transforms[]
```

---

# 8. View Slot

Un `ViewSlot` rappresenta una posizione logica disponibile nel Viewer.

NuClear prevede fino a 16 slot.

Organizzazione proposta:

```text
Group 0
0  MIP
1  PET
2  GENERIC
3  FUSION

Group 1
4  MIP
5  PET
6  GENERIC
7  FUSION

Group 2
8  MIP
9  PET
10 GENERIC
11 FUSION

Group 3
12 MIP
13 PET
14 GENERIC
15 FUSION
```

I termini:

```text
MIP
PET
GENERIC
FUSION
```

definiscono il **ruolo dello slot**, non il tipo fondamentale di renderer.

## 8.1 ViewSlot e ViewportSurface non sono la stessa cosa

`ViewSlot` definisce **che cosa** occupa una posizione logica nel workspace.

`ViewportSurface` definisce **dove** una vista interattiva viene materializzata a schermo.

```text
ViewSlot
├── id
├── role
├── viewStateRef
├── resourceDemand
└── status

ViewportSurface
├── surfaceId
├── stable viewportId
├── Cornerstone element/canvas
├── tool bindings
├── bound ViewSlot or ComposerViewInstance
└── lifecycle state
```

NuClear può mantenere fino a 16 `ViewportSurface` persistenti, ma il numero di superfici attive, visibili e renderizzate può cambiare con il layout.

Il `ViewportSurfaceRegistry` mantiene identità e lifecycle. Il `SurfaceLayoutManager` decide la geometria di visualizzazione:

```text
persistent ViewportSurface layer
              ↑
       SurfaceLayoutManager
          ↙          ↘
Viewer slot rect    Composer panel rect
```

Passare dal Viewer al Composer non deve distruggere e ricreare la viewport quando la stessa superficie può essere riutilizzata. Il renderer Cornerstone e il suo Context Pool restano responsabili dei contesti WebGL effettivi.

---

# 9. View Group

Un `ViewGroup` raccoglie logicamente quattro slot correlati:

```text
ViewGroup
├── MIP
├── PET
├── GENERIC
└── FUSION
```

Può rappresentare, ad esempio:

- uno studio;
- un timepoint;
- un caso;
- una combinazione PET/CT;
- una diversa serie dello stesso paziente.

Il gruppo non implica automaticamente che tutti gli stati siano sincronizzati.

---

# 10. Medical View State

Una View deve essere costruita per composizione.

```text
MedicalViewState
├── DataBinding
├── SpatialState
├── CameraState
├── PresentationState
├── ProjectionState
├── CompositionState
└── CoordinateTransformSet
```

`CoordinateTransformSet` non introduce un secondo stato medicale. Rende esplicite le trasformazioni derivate necessarie per passare fra gli spazi descritti nelle sezioni successive.

---

# 11. Spatial State

Descrive **dove si sta guardando nel paziente**.

Possibili campi:

```text
SpatialState
├── frameOfReferenceUID
├── patientPosition
├── orientation
├── viewPlaneNormal
├── viewUp
└── referenceLocation
```

La posizione deve essere espressa preferibilmente in patient space quando possibile.

La slice index è una conseguenza del dato corrente, non la principale coordinata semantica.

`SpatialState` governa il passaggio:

```text
Patient Space (LPS mm)
        ↓
View Plane Space (mm sul piano)
```

La trasformazione deve conservare orientamento, origine, spacing e riferimenti necessari a ricondurre ogni punto del piano al paziente.

---

# 12. Camera State

Descrive l'inquadratura.

```text
CameraState
├── zoom
├── pan
├── rotation
├── focalPoint
└── fitMode
```

Spatial State e Camera State devono restare separati.

Due viste possono guardare lo stesso punto anatomico ma avere inquadrature differenti.

`CameraState`, insieme alla proiezione, governa il passaggio:

```text
View Plane Space
        ↓
Viewport Space (render pixels)
```

Il `pan` della camera sposta l'inquadratura del dato medicale. Non è il crop del pannello e non sposta il pannello sul foglio.

## 12.1 Catena completa delle coordinate

La catena normativa è:

```text
Patient Space (LPS mm)
       ↓ SpatialState
View Plane Space (mm)
       ↓ CameraState + ProjectionState
Viewport Space (pixels)
       ↓ PanelFramingState
Panel Content Space (normalized units or mm)
       ↓ PanelLayoutState
Figure Sheet Space (physical mm)
```

Ogni livello ha un proprietario:

| Trasformazione | Stato proprietario | Package |
|---|---|---|
| Patient → View Plane | `SpatialState` | `view-engine` / `medical-engine` |
| View Plane → Viewport | `CameraState`, `ProjectionState` | `view-engine` / renderer |
| Viewport → Panel Content | `PanelFramingState` | `figure-engine` |
| Panel Content → Figure Sheet | `PanelLayoutState` | `figure-engine` |

Annotazioni e misure patient-anchored devono conservare coordinate in Patient Space. Elementi puramente editoriali devono vivere in Panel Content Space o Figure Sheet Space. Una conversione in pixel di schermo non deve diventare la loro fonte di verità.

Il comportamento durante navigazione e fine adjustment dipende dall'ancoraggio:

- **Patient-Anchored**: una freccia, una misura o un marker riferito a una lesione conserva il proprio anchor in coordinate LPS. Segue pan, zoom, rotazione e trasformazioni della camera. Se il piano visualizzato si allontana dalla posizione dell'annotazione oltre una tolleranza dichiarata, l'annotazione viene nascosta o attenuata secondo una policy esplicita; non resta visibile su una slice anatomicamente diversa come se fosse ancora valida.
- **Panel-Anchored / Editoriale**: lettere di pannello come `A`, etichette come `PET MIP`, badge e frecce puramente editoriali conservano il proprio anchor in Panel Content Space o Figure Sheet Space. Restano fissi rispetto al pannello o al foglio durante slice scrolling, pan e zoom medicali.

L'ancoraggio e la rappresentazione grafica sono proprietà distinte: un'annotazione patient-anchored può essere emessa come vettore nel PDF pur mantenendo la propria posizione derivata dal Patient Space.

---

# 13. Presentation State

Descrive **come il dato viene mostrato**.

```text
PresentationState
├── voi
├── colormap
├── invert
├── opacity
├── interpolation
└── modalityPresentation
```

Per PET:

```text
PETPresentation
├── suvRange
├── colormap
├── opacity
└── threshold
```

Per CT:

```text
CTPresentation
├── window
├── level
└── inversion
```

---

# 14. Projection State

Descrive il modo in cui il volume viene trasformato in una rappresentazione visuale.

```text
ProjectionState
├── mode
├── slabThickness
└── projectionParameters
```

Possibili modalità:

```text
slice
MIP
MinIP
Average
```

Il MIP non deve essere considerato un tipo speciale di DICOM.

È:

```text
ImagingAsset
+
ProjectionState = MIP
```

---

# 15. Composition State

Descrive la composizione di più sorgenti nella stessa View.

Caso principale:

```text
PET + CT → Fusion
```

```text
CompositionState
├── mode
├── layers[]
├── blend
└── layerPresentation[]
```

La Fusion non deve essere rappresentata come un nuovo dataset duplicato quando non è necessario.

Può essere una View derivata da più Imaging Asset.

---

# 16. Shared State

Alcune viste possono condividere lo stesso stato.

Esempio:

```text
PET
CT
Fusion
```

possono condividere:

```text
SpatialState A
CameraState B
```

ma avere Presentation State differenti.

Esempio:

```text
PET
├── Spatial A
├── Camera B
└── PET Presentation P1

CT
├── Spatial A
├── Camera B
└── CT Presentation P2

Fusion
├── Spatial A
├── Camera B
├── PET Presentation P1
├── CT Presentation P2
└── Fusion Composition F1
```

---

# 17. Link, Lock e Override

Sono tre concetti differenti.

## LINK

Indica che due o più elementi condividono o sincronizzano uno stato.

Esempi:

```text
LINK position
LINK camera
LINK PET presentation
```

Il linking spaziale riconosce due modalità fisicamente diverse:

### Co-referenziato / Intra-Study

Viste geometricamente compatibili nello stesso `FrameOfReferenceUID` possono condividere direttamente lo stesso `SpatialState`.

Esempi:

```text
PET + CT dello stesso studio
PET slice + PET MIP dello stesso volume
PET + Fusion co-referenziata
```

La sincronizzazione opera sulle stesse coordinate assolute LPS in millimetri, previa verifica della compatibilità geometrica.

### Relativo o trasformato / Inter-Study

Studi longitudinali o acquisizioni con `FrameOfReferenceUID` differenti non devono condividere direttamente coordinate LPS come se descrivessero lo stesso spazio fisico.

Il link può operare tramite:

- propagazione di differenziali di navigazione, per esempio `Δposition` o `Δz`, mantenendo un riferimento locale per ciascuno studio;
- composizione attraverso uno `SpatialTransform` registrato fra i due Frame of Reference;
- una policy di sincronizzazione esplicita che dichiari direzione, unità, tolleranze e comportamento fuori dominio.

```text
SpatialState A
    ↓ SpatialTransform A→B
SpatialState B
```

La registration e la validazione della trasformazione appartengono al `medical-engine` tramite `ScientificWorkerBridge`. In assenza di una trasformazione valida, NuClear non deve trattare due Frame of Reference diversi come co-referenziati.

---

## LOCK

Impedisce modifiche accidentali a una proprietà o gruppo di proprietà.

Esempi:

```text
LOCK orientation
LOCK camera
LOCK fusion settings
```

Un lock non implica necessariamente condivisione dello stato.

---

## OVERRIDE

Permette a un'istanza locale di divergere dallo stato di origine.

Caso principale:

```text
PreparedView
    ↓
ComposerPanel
    ↓
Local Override
```

Esempio:

```text
sliceOffset = +2 mm
```

senza modificare la Prepared View originale.

---

# 18. Prepared View

Una `PreparedView` rappresenta una configurazione medicale già preparata dall'utente.

Contiene:

```text
PreparedView
├── source bindings
├── source locators
├── source fingerprints
├── spatial state
├── camera state
├── presentation state
├── projection state
├── composition state
├── links
├── locks
├── provenance
└── cached preview reference
```

Il suo contenuto primario non è un'immagine raster.

È uno stato medicale riproducibile.

La `CachedPreview` è un raster disposable generato dall'ultimo stato approvato o salvato. Non sostituisce la sorgente e non diventa il nuovo contenuto medicale.

Serve a:

- riaprire un `.mcv` (o `.ncr`) mantenendo layout e leggibilità;
- mostrare il contenuto approvato quando la sorgente è temporaneamente offline;
- distinguere chiaramente una preview congelata da una vista medicale interattiva.

La preview deve conservare almeno:

```text
CachedPreview
├── preparedViewId
├── raster asset
├── pixel dimensions
├── color profile
├── generatedAt
├── render state hash
├── source fingerprint set
└── renderer/version metadata
```

Non deve essere usata per ricalcolare SUV, cambiare slice, eseguire misure o fingere accesso ai voxel originali.

---

# 19. Provenance

Ogni Prepared View deve poter ricostruire da dove proviene.

```text
ViewProvenance
├── StudyInstanceUID
├── source asset IDs
├── source series
├── source fingerprints
├── transforms
├── scientific worker operation metadata
├── preset IDs
└── rendering/version metadata
```

Questo è importante per:

- riproducibilità;
- aggiornamenti;
- export;
- audit;
- future publication metadata.

---

# 20. Viewer

Il Viewer è l'ambiente dedicato alla preparazione medicale strutturale.

Principali responsabilità:

```text
LOAD
SELECT
ORIENT
FRAME
ALIGN
LINK
ADJUST
LOCK
PREPARE
```

Qui l'utente deve poter:

- scegliere serie;
- assegnare Imaging Assets;
- configurare PET/CT;
- scegliere orientamento;
- identificare regione anatomica;
- impostare WL/SUV;
- creare fusion;
- creare MIP;
- impostare sincronizzazioni;
- preparare una View.

Il Viewer usa componenti provenienti da `ui`, ma la logica resta in `view-engine` e `medical-engine`.

```text
Viewer UI
   ↓ intent
view-engine
   ↓ imaging operations
medical-engine
```

La griglia del Viewer non possiede le viewport. Ospita geometricamente le `ViewportSurface` assegnate dal `SurfaceLayoutManager`.

Quando una vista diventa visibile, il `view-engine` aggiorna la domanda di risorse; il `medical-engine` carica o promuove in cache ciò che serve e aggiorna lo stato `loading`/`online` senza cambiare l'identità semantica della View.

---

# 21. Figure Composer

Il Composer è un ambiente diverso sullo stesso stato medicale.

Non riceve screenshot.

Riceve:

```text
PreparedView
```

e crea:

```text
ComposerPanel
```

Anche il Composer utilizza `ui` per:

- canvas chrome;
- inspector;
- toolbars;
- pannelli;
- controls;
- menus;
- interaction feedback.

La semantica delle figure rimane però nel `figure-engine`.

Quando un pannello medicale è interattivo, il Composer adotta una `ViewportSurface` persistente già disponibile nel registry. Non istanzia un secondo renderer medicale e non trasforma la `PreparedView` in uno screenshot.

Il passaggio fra Viewer e Composer può cambiare posizione e dimensione visuale della superficie, ma non la sua identità, i tool binding o lo stato medicale associato.

---

# 22. Composer Panel

Un pannello medicale nel Composer ha quattro componenti principali:

```text
ComposerPanel
├── PanelFramingState
├── PanelLayoutState
├── PanelDecorationState
└── MedicalViewBinding
```

## Panel Framing State

Proprietà editoriali che definiscono come il contenuto della viewport appare dentro l'apertura del pannello:

```text
crop
content scale
content offset
aperture alignment
overflow policy
```

`PanelFramingState` governa il passaggio da Viewport Space a Panel Content Space. Non modifica `CameraState`.

## Panel Layout State

Proprietà editoriali:

```text
position
size
rotation
constraints
alignment
z-order
```

`PanelLayoutState` governa il passaggio da Panel Content Space a Figure Sheet Space, espresso in millimetri fisici.

## Panel Decoration State

Proprietà visuali del contenitore:

```text
border
label
background
caption binding
```

## Medical View Binding

Riferimento al contenuto medicale:

```text
preparedViewId
localOverrides
availabilityState
interactiveSurfaceBinding
```

`availabilityState` assume uno dei valori:

```text
online
loading
offline-cached
missing
mismatch
```

- `online`: sorgenti verificate e operazioni medicali disponibili;
- `loading`: sorgenti verificate, risorse in caricamento;
- `offline-cached`: sorgenti irraggiungibili, preview approvata disponibile;
- `missing`: sorgenti irraggiungibili e nessuna preview valida;
- `mismatch`: il locator risolve una sorgente il cui fingerprint non coincide.

Lo stato non deve essere dedotto solo dall'esistenza di un path.

---

# 23. Composer View Instance

Quando una Prepared View viene inserita in una figura, viene creata un'istanza.

```text
PreparedView
    ↓
ComposerViewInstance
```

L'istanza può mantenere gli stessi valori della Prepared View oppure applicare override locali.

Esempio:

```text
PreparedView:
patientPosition = Z

ComposerViewInstance:
sliceOffset = +2 mm
```

Questo consente di modificare la slice nel Composer senza tornare nel Viewer.

---

# 24. Inspector del Composer

L'Inspector deve distinguere chiaramente proprietà editoriali e proprietà medicali.

Esempio:

```text
PANEL
  Position
  Size
  Border
  Label

FRAMING
  Crop
  Content Scale
  Content Offset

MEDICAL VIEW
  Slice / Patient Position
  Orientation
  Zoom
  Pan

PRESENTATION
  Window / Level
  PET SUV Range
  Colormap
  Fusion Opacity

LINKS
  Position
  Camera
  Presentation

LOCKS
  Orientation
  Camera
  Presentation

SOURCE
  Availability
  Relink
  Fingerprint status
```

L'Inspector è un ottimo esempio della relazione corretta fra `ui` e dominio.

```text
Inspector UI
      │
      ├── Panel controls ─────→ figure-engine
      │
      └── Medical controls ───→ view-engine
```

Lo stesso Inspector può quindi mostrare contemporaneamente proprietà provenienti da due domini senza spostarne la logica dentro `ui`.

---

# 25. Edit Scope

Quando una proprietà viene modificata dal Composer deve essere chiaro il livello su cui viene applicata.

Possibili scope:

```text
THIS PANEL
LINKED PANELS
SOURCE VIEW
```

## THIS PANEL

Crea o modifica un override locale.

## LINKED PANELS

Propaga la modifica alle istanze appartenenti allo stesso gruppo.

## SOURCE VIEW

Modifica direttamente la Prepared View da cui derivano i pannelli.

La UI espone la scelta dello scope.

La risoluzione della propagazione appartiene agli engine.

---

# 26. Fine adjustment nel Composer

Il Composer deve supportare regolazioni medicali fini.

Sicuramente:

- slice up/down;
- patient position;
- zoom;
- pan;
- WL;
- SUV range;
- opacity;
- fusion blend.

Potenzialmente:

- orientation;
- slab thickness;
- projection settings.

Le operazioni strutturali più profonde devono invece rimanere nel Viewer.

Esempi:

- cambiare serie;
- cambiare registration;
- sostituire Imaging Asset;
- modificare Frame of Reference;
- creare nuove associazioni PET/CT.

Principio:

```text
Viewer = structural medical preparation

Composer = medical fine adjustment
           +
           figure composition
```

Durante il fine adjustment, gli elementi patient-anchored vengono riproiettati attraverso la catena Patient → View Plane → Viewport; gli elementi panel-anchored non partecipano a tale trasformazione. La visibilità fuori piano delle annotazioni patient-anchored segue la tolleranza e la policy definite in §12.1.

## 26.1 Fine adjustment e disponibilità della sorgente

I controlli medicali sono abilitati solo quando i dati necessari sono disponibili e verificati.

| Stato | Visualizzazione | Fine adjustment medicale | Export |
|---|---|---|---|
| `online` | live | abilitato | live ad alta risoluzione |
| `loading` | preview o placeholder | temporaneamente disabilitato | attende o fallisce esplicitamente |
| `offline-cached` | `CachedPreview` | disabilitato | solo preview, con policy esplicita |
| `missing` | placeholder diagnostico | disabilitato | bloccato per il pannello |
| `mismatch` | preview/placeholder con errore | disabilitato | bloccato finché non risolto |

Il comportamento deve essere **fail-closed**:

- NuClear non associa automaticamente una serie "simile";
- non aggiorna il fingerprint atteso per far coincidere una sorgente diversa;
- non abilita SUV, slice, misure, resampling o registration su una preview raster;
- non sostituisce silenziosamente un render approvato con dati non verificati.

Il relink è un'operazione esplicita. Dopo il relink il sistema verifica i fingerprint, segnala le differenze e richiede una decisione consapevole per ogni sostituzione incompatibile.

---

# 27. View Preparation

La preparazione di una View deve essere composta da operazioni semplici.

Primitive possibili:

```text
bindAsset()
setOrientation()
setPatientPosition()
setCamera()
setVOI()
setColormap()
setProjection()
addOverlay()
linkState()
unlinkState()
lockState()
unlockState()
createPreparedView()
```

Workflow complessi devono essere composizioni di queste primitive.

Esempio:

```text
prepareStandardPETCT()
```

non deve contenere un secondo sistema parallelo.

---

# 28. Automatic View Preparation

Il sistema può successivamente utilizzare regole simili a semplici Hanging Protocol.

Esempio:

```text
Whole-body PET/CT detected

PET       → PET slot
CT        → GENERIC slot
PET       → MIP slot
PET + CT  → FUSION slot
```

Questo livello dovrebbe configurare:

- binding;
- orientation;
- projection;
- initial presentation;
- linking.

Non dovrebbe nascondere o duplicare le primitive fondamentali.

## 28.1 Progetto `.mcv` / `.ncr` offline-safe

Il file di progetto deve conservare separatamente identità attesa, posizione tentata e fallback visuale:

```text
NuClear project
├── SourceLocator[]
├── SourceFingerprint[]
├── PreparedView[]
├── CachedPreview[]
├── Figure / Page / Panel state
└── provenance and version metadata
```

Sequenza di apertura:

```text
resolve SourceLocator
        ↓
source reachable?
   ├── no  → CachedPreview valid?
   │           ├── yes → offline-cached
   │           └── no  → missing
   │
   └── yes → verify SourceFingerprint
               ├── match    → loading → online
               └── mismatch → mismatch
```

La riapertura offline non deve rompere il layout, eliminare pannelli o alterare lo stato salvato. Il Composer può mostrare l'ultima preview valida con un'indicazione non ambigua che il contenuto non è live.

Una preview è valida solo se il proprio `render state hash` e il proprio `source fingerprint set` corrispondono alla `PreparedView` salvata. In caso contrario il sistema mostra uno stato diagnostico, non un'immagine potenzialmente fuorviante.

---

# 29. Rendering

Il rendering deve ricevere uno stato semantico.

Concettualmente:

```text
render(
  DataBinding,
  SpatialState,
  CameraState,
  PresentationState,
  ProjectionState,
  CompositionState,
  RenderTarget
)
```

Il backend concreto può essere Cornerstone3D.

Il resto dell'applicazione non dovrebbe dipendere direttamente dai suoi oggetti interni.

La UI non parla quindi direttamente con Cornerstone salvo adattatori molto confinati.

Idealmente:

```text
UI
 ↓
View Engine
 ↓
Medical Rendering Adapter
 ↓
Cornerstone3D
```

## 29.1 Persistent Viewport Surfaces

Il percorso interattivo usa il `ViewportSurfaceRegistry`:

```text
MedicalViewState
      ↓
ViewportSurfaceRegistry
      ↓ bind
Persistent ViewportSurface
      ↓
Cornerstone RenderingEngine
      ↓
Context Pool WebGL
```

Ogni superficie mantiene:

- `surfaceId` stabile;
- `viewportId` stabile;
- elemento e canvas gestiti dall'adapter;
- tool group e interaction bindings;
- binding corrente a View o Composer instance;
- stato di visibilità e layout;
- stato del lifecycle.

Il Viewer e il Composer chiedono dove mostrare una superficie; non possiedono direttamente il contesto WebGL.

Il numero massimo di 16 descrive le superfici logiche/interattive previste da NuClear. Il numero dei contesti WebGL è determinato dal Context Pool di Cornerstone e non deve essere hardcoded come equivalente al numero di slot.

## 29.2 Stable viewport identity

Il requisito architetturale è:

> una vista interattiva può cambiare host visuale senza perdere arbitrariamente identità, stato o binding.

L'implementazione può usare un layer persistente riposizionato, un meccanismo di portal o un'altra strategia compatibile. La scelta deve evitare:

- mount/unmount non necessari;
- ricreazione dei canvas;
- duplicazione delle toolchain;
- accumulo di contesti WebGL;
- dipendenze del dominio da React o dal DOM.

## 29.3 Rendering e residency

Prima del render, il `view-engine` dichiara la domanda:

```text
View / Panel visible
        ↓ demand + priority
medical-engine ResourceManager
        ↓
metadata / CPU pixels / GPU resources
        ↓
render-ready or explicit failure state
```

L'eviction non elimina la View. Una vista espulsa dalla cache torna a `loading` quando diventa nuovamente necessaria.

Le policy di cache devono considerare almeno:

- budget RAM;
- budget GPU stimato;
- visibilità;
- interattività;
- costo di ricostruzione;
- priorità di export;
- asset condivisi da più View;
- risorse derivate riproducibili.

Le risorse condivise devono usare reference accounting o un meccanismo equivalente; il rilascio di una View non deve invalidare un volume ancora richiesto da un'altra.

## 29.4 Rendering scientifico

Quando il rendering dipende da operazioni scientifiche — SUVbw, verifica geometrica, resampling o registration — il `medical-engine` utilizza i risultati del `ScientificWorkerBridge` e ne conserva la provenance.

Uno stato non validato o una geometria incompatibile devono produrre un errore esplicito. Il renderer non deve correggere silenziosamente orientamenti, spacing o Frame of Reference.

---

# 30. Export

L'export finale deve partire dagli stessi oggetti usati dal Composer.

```text
Figure
├── text
├── graphics
├── medical panels
└── layout
        ↓
same render path
        ↓
publication renderer
        ↓
PDF / TIFF / PNG
```

Il pannello medicale deve essere renderizzato alla risoluzione necessaria per l'output finale, non semplicemente ingrandendo il framebuffer visibile a schermo.

## 30.1 Temporary high-resolution RenderTarget

L'export usa un target temporaneo dimensionato dall'output fisico:

```text
panel size in mm
        +
target DPI
        ↓
required pixel dimensions
        ↓
temporary high-resolution RenderTarget
```

Esempio:

```text
8 cm / 2.54 × 600 DPI ≈ 1890 px
```

Un pannello da `8 × 8 cm` a `600 DPI` richiede quindi circa `1890 × 1890 px`, indipendentemente dai pixel occupati sul monitor.

Pipeline:

```text
ComposerViewInstance
    ↓ resolve PreparedView + local overrides
MedicalViewState
    ↓ same presets / transforms / rendering semantics
temporary high-resolution RenderTarget
    ↓ render
pixel buffer
    ↓ color / alpha / composition
PDF / TIFF / PNG
```

La composizione finale distingue due famiglie di output:

- **TIFF / PNG — output raster**: il render medicale e gli elementi editoriali vengono composti e appiattiti in un'unica immagine alla densità di pixel richiesta. Testi e primitive grafiche non restano oggetti modificabili.
- **PDF — output ibrido**: il contenuto medicale viene incorporato come raster ad altissima risoluzione prodotto dal `RenderTarget`; typography, lettere e badge dei pannelli, scalebar, frecce e annotazioni vengono preservati come primitive PDF vettoriali native in Figure Sheet Space quando la loro semantica lo consente.

Per il PDF, la posizione di annotazioni patient-anchored e scalebar può essere calcolata dalla geometria medicale, ma la loro rappresentazione finale resta vettoriale. Font, stroke, fill, clipping e trasformazioni devono essere emessi in coordinate fisiche del foglio, senza rasterizzare l'intera pagina.

Il `RenderTarget` può essere un canvas offscreen, un target interno al backend o un'altra superficie temporanea. Il contratto non impone il resize del canvas live.

Requisiti:

- non alterare la geometria del Composer durante l'export;
- non cambiare persistentemente `CameraState`, aspect ratio o viewport size interattiva;
- usare gli stessi `MedicalViewState`, preset, trasformazioni e semantiche di composizione;
- ripristinare o rilasciare ogni risorsa temporanea;
- registrare dimensioni, DPI, color profile e versione del renderer nella provenance dell'output;
- produrre errore esplicito se le sorgenti necessarie non sono disponibili o non corrispondono.

Principio:

> **same rendering path does not require the same physical canvas.**

Per Viewer e Composer interattivi si condividono le `ViewportSurface` persistenti. Per l'export si condivide stato e renderer, usando un target appropriato alla risoluzione di pubblicazione.

## 30.2 Export da stato offline

Una `CachedPreview` può essere inclusa in un export solo tramite una policy esplicita del prodotto e con indicazione verificabile che il pannello deriva da una preview, non da un render live. Non deve essere automaticamente interpolata e presentata come output medicale ad alta risoluzione.

Per un export publication-grade, lo stato predefinito è fail-closed: `missing`, `mismatch` e `offline-cached` bloccano il render medicale live del pannello interessato.

---

# 31. Flusso completo

```text
DICOM
  ↓
medical-engine
  ├── ScientificWorkerBridge → Python worker
  └── ResourceManager → RAM / VRAM residency
  ↓
ImagingAsset
  ↓
view-engine
  ↓
MedicalViewState
  ↓
ViewSlot
  ↓
Persistent ViewportSurface
  ↓
PreparedView
  ↓
project-model
  ↓
ComposerViewInstance
  ↓
PanelFramingState + PanelLayoutState + Medical Overrides
  ↓
figure-engine
  ↓
Temporary High-resolution RenderTarget
  ↓
High-resolution medical raster layer
  ↓
Publication compositor
  ├── flatten all layers → TIFF / PNG
  └── raster medical layer + vector editorial layers → PDF
```

La persistenza offline segue un percorso parallelo:

```text
SourceLocator + SourceFingerprint
              ↓ resolve / verify
online ───────────────→ live MedicalViewState
offline + valid cache → CachedPreview / offline-cached
missing ──────────────→ explicit missing state
mismatch ─────────────→ fail-closed mismatch state
```

La UI avvolge e controlla questo flusso senza sostituirsi ad esso:

```text
                    UI
          ┌─────────┼─────────┐
          ▼         ▼         ▼
       Viewer    Composer   Inspector
          │         │         │
          └─────────┼─────────┘
                    ▼
             domain engines
```

---

# 32. Oggetti principali da realizzare

Prima lista concettuale:

```text
ImagingWorkspace

StudyReference
ImagingAsset
AssetGeometry
SpatialTransform
SourceLocator
SourceFingerprint
AssetAvailability
AssetResidency
ResourceDemand
ResourceManager
ScientificWorkerBridge

ViewGroup
ViewSlot
ViewportSurface
ViewportSurfaceRegistry
SurfaceLayoutManager

DataBinding
SpatialState
CameraState
PresentationState
ProjectionState
CompositionState
CoordinateTransformSet

SharedStateGroup
LinkDefinition
SpatialLinkMode
LockDefinition

PreparedView
ViewProvenance
CachedPreview

ComposerPanel
ComposerViewInstance
MedicalViewOverride
PanelFramingState
PanelLayoutState
PanelDecorationState
AnnotationAnchor
EditScope

RenderTarget
PublicationRenderRequest
PublicationOutputMode
```

Non tutti questi elementi devono necessariamente diventare classi.

Molti possono essere:

- type;
- interface;
- immutable value object;
- discriminated union;
- store entity.

La scelta implementativa viene dopo la definizione semantica.

---

# 33. Elementi UI principali da prevedere

A livello concettuale, il package `ui` dovrà supportare almeno:

```text
App Shell

Top Bar
Viewer Toolbar
Composer Toolbar

Study Browser

Viewport Frame
Viewport Header
Viewport Overlay
Viewport Status
Source Availability Badge
Offline Cached Badge
Relink Source Control
Loading / Missing / Mismatch State

Viewer Mode Selector
View Group Selector

Inspector
Inspector Section
Inspector Field
Inspector Group

Slice Control
Window / Level Control
SUV Range Control
Colormap Control
Fusion Control
Projection Control

Link Control
Lock Control
Edit Scope Control

Canvas Panel Chrome
Selection Handles
Resize Handles
Alignment Guides
Panel Framing Control
Publication Render Progress

Dialogs
Menus
Context Menus
Notifications
```

Questa lista descrive **primitive UI**, non necessariamente componenti React uno-a-uno.

L'obiettivo è evitare due estremi:

- un unico enorme componente `MedicalViewer`;
- centinaia di componenti microscopici senza responsabilità significativa.

La UI deve seguire lo stesso principio del dominio:

> componenti piccoli, semanticamente chiari e componibili.

---

# 34. Regola architetturale fondamentale

Il percorso deve rimanere sempre leggibile come:

```text
ASSET
  ↓
STATE
  ↓
VIEW
  ↓
LINK
  ↓
PREPARE
  ↓
INSTANCE
  ↓
FIGURE
  ↓
EXPORT
```

La UI agisce lateralmente su questi livelli:

```text
            UI
             ↕
ASSET → STATE → VIEW → LINK → PREPARE → INSTANCE → FIGURE → EXPORT
```

ma non deve sostituirsi ad essi.

Ogni livello deve avere una responsabilità chiara.

NuClear deve evitare sia:

- oggetti monolitici che nascondono troppe responsabilità;
- atomizzazione eccessiva che frammenta il dominio in centinaia di piccoli oggetti senza significato autonomo;
- componenti UI che incorporano logica medicale;
- engine che incorporano dettagli di React o Electron.

L'unità di astrazione deve essere **piccola ma semanticamente completa**.

La regola generale dell'interfaccia è:

> **render state, emit intent.**

La regola generale del dominio è:

> **receive intent, mutate state according to explicit rules.**

Tre corollari completano la regola:

> **semantic lifetime is not resource residency.**

> **stable viewport identity is not one WebGL context per slot.**

> **same rendering path is not necessarily the same physical canvas.**
