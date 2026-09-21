# Phase 3 — MedCanvas Recovery Addendum

## Scopo

Questo documento integra `PHASE_3_MEDICAL_ENGINE_PLAN.md` e
`PHASE_3_OPENCODE_RUNBOOK.md` per le sole slice successive a P3.2:

- P3.3 — `ResourceManager`, residency, budget, eviction e reload;
- P3.4 — applicazione di `MedicalViewState`, radiometria PET/CT, MPR/MIP e
  ordinary medical raster capture;
- P3.5 — temporary high-resolution `RenderTarget`.

MedCanvas è stato consultato come fonte di comportamento già esercitato,
regressioni e test utili. Non è una dipendenza runtime, non è un target di
compatibilità e non sostituisce i contratti NuClear, il Vademecum, l'architettura
v3 o la specifica `PET_CT_FUSION_RADIOMETRY_SPEC.md`.

OpenCodeRAG non era disponibile in questo ambiente. Il recupero è stato eseguito
con `rg`, `find`, `sed` e lettura diretta dei file indicati; i riferimenti
riportati sotto sono quindi verificabili nel repository corrente.

## Autorità e regola di traduzione

Ordine di autorità:

1. `AGENTS.md` e regole `.agents/rules/` di NuClear;
2. `PROJECT_VADEMECUM.md` e `NUCLEAR_ARCHITECTURE_V3.md`;
3. `PHASE_3_MEDICAL_ENGINE_PLAN.md` e `PHASE_3_OPENCODE_RUNBOOK.md`;
4. `PET_CT_FUSION_RADIOMETRY_SPEC.md` per la radiometria P3.4;
5. questo addendum per il recupero mirato da MedCanvas;
6. MedCanvas come evidenza di comportamento e regressioni, mai come autorità
   clinica o architetturale.

Ogni elemento recuperato deve essere convertito in una di queste forme:

```text
comportamento osservato
    -> contratto NuClear già esistente o decisione esplicita
    -> test NuClear riproducibile
    -> implementazione nuova, indipendente da MedCanvas
```

Non si trasferiscono file o API soltanto perché il comportamento esiste già.

## Stato verificato di NuClear prima del recupero

P3.2.1 è chiusa nel commit `8c1945a`. La base corrente include:

- harness Cornerstone/WebGL reale di P3.0/P3.1;
- costruzione locale di volumi CT/PT da payload pixel espliciti;
- validazione fail-closed di disponibilità, classificazione, geometria,
  payload e semantica scalare;
- `VOLUME_CONSTRUCTION_FAILED` con preservazione della causa e pulizia di
  eventuali entry residue;
- fixture pixel-bearing CT/PT e test di costruzione, cleanup e reload manuale.

I contratti condivisi già presenti coprono `ImagingAsset`, `AssetGeometry`,
`AssetAvailabilityStatus`, `AssetResidencyTier`, `ResourceDemand`,
`MedicalViewState`, `PreparedView`, `TemporaryRenderTargetSpec` e
`PublicationRenderRequest`. Esistono anche i validator e le fixture di
contratto.

Le lacune reali sono invece:

| Slice | Stato NuClear attuale | Conseguenza |
|---|---|---|
| P3.3 | nessun `ResourceManager` runtime; nessuna state machine di residency, demand, budget o eviction | recupero necessario prima di fissare il lifecycle fisico |
| P3.4 | `@nuclear/rendering-presets` è ancora un barrel vuoto; l'adapter dichiara state application e capture fuori scope | recuperare algoritmi e test, poi riscrivere sul nuovo `MedicalViewState` |
| P3.5 | esiste il contratto del target, ma non il renderer/capture target | recuperare solo dimensionamento e invarianti; implementare un target Cornerstone reale |

P3.2.1 non va riaperta per questo recupero. Il suo confine corretto è il
payload validato e il volume Cornerstone costruibile; il lifecycle superiore
appartiene a P3.3.

## Decisioni integrative

### D1 — ResourceManager basato su risorse condivise, non su slot

Il recupero di `VolumeRefRegistry` dimostra che una stessa risorsa può essere
usata contemporaneamente da più consumatori: per esempio CT e PET sono entrambi
trattenuti da una fusion e lo stesso PET può servire PET, MIP e fusion.

NuClear deve sostituire lo `slotId` MedCanvas con un identificatore di lease o
consumer opaco, associato alla richiesta di risorsa. La chiave fisica deve
identificare il volume costruito (`volumeId`, con `assetId` e digest geometrico
provenienti dal piano P3.2), non una cella UI.

Invariant obbligatori:

```text
retain(new demands)
  -> release(removed leases)
  -> evict only resources with zero live leases and lowest declared priority
```

Il manager non deve usare `cache.purgeCache()` né un purge globale equivalente.
Una fusion genera due richieste di risorsa, non un volume composito implicito.

`AssetResidencyTier` resta distinto da `AssetAvailabilityStatus`: eviction
libera CPU/GPU ma non cancella asset, fingerprint, provenance o possibilità di
reload. Un fallimento di enumerazione o purge non può essere riportato come
eviction avvenuta; deve produrre esito typed/diagnostico e lasciare la residency
non confermata.

### D2 — La demand è dichiarativa e non contiene policy del workspace

P3.3 accetta `ResourceDemand` già definita da `shared-types`. Non importa
`view-engine`, non conosce Viewer/Composer e non ricostruisce priorità a partire
da DOM, slot o selezione UI. Le decisioni di visibilità e priorità arriveranno
dal futuro view-engine.

### D3 — Radiometria PET: usare l'evidenza worker senza reinterpretare i pixel

Il worker rimane l'autorità per geometria, quantitation e provenance. Il piano
P3.2 PT corrente dichiara `scalarDataDomain: "rescaled-bqml"`: P3.4 deve passare
questi scalari a Cornerstone senza ricalcolare SUVbw.

Per mappare un intervallo SUV in valori del volume si può usare il fattore
`suvFactor`, come comportamento recuperato da MedCanvas, ma solo se:

```text
asset.metadata.pet?.units === "BQML"
AND asset.metadata.petQuantitation?.status === "computed"
AND asset.metadata.petQuantitation.suvFactor è finito e > 0
AND il piano dichiara scalarDataDomain === "rescaled-bqml"
```

La specifica PET attuale scrive `PetQuantitationResult.units === "BQML"`, ma il
tipo NuClear non ha quel campo: le unità sono in
`asset.metadata.pet?.units`. Non aggiungere un campo duplicato per incidente.
Prima di implementare P3.4 l'agente deve ratificare questa traduzione nel
proprio diff/ADR o nella specifica; fino ad allora il guard corretto è quello
sopra. Un risultato worker assente, `invalid`, `unavailable`, con unità diverse
da `BQML` o fattore non valido deve fallire chiuso, mai produrre una fusion
quantitativamente plausibile.

È inoltre da rendere coerente la semantica dichiarata dal fixture PET: il
payload P3.2 è Bq/mL, mentre alcuni fixture di contratto descrivono
`valueSemantics.unit` come `g/mL` per SUVbw. P3.4 non deve accettare entrambe le
interpretazioni in modo implicito: il dominio dello scalare renderizzato e il
guard di quantitation devono essere espliciti e testati.

### D4 — `MedicalViewState` è l'unico input semantico di rendering

MedCanvas serializza camera, VOI, PET window, colormap, opacity, MPR/MIP e
provenance per viewport. Il recupero utile è il principio di round-trip e di
assenza di fallback cross-view, non la struttura `MedicalViewportState` legacy.

P3.4 deve applicare la composizione NuClear:

```text
DataBinding + SpatialState + CameraState + PresentationState
  + ProjectionState + CompositionState + CoordinateTransformSet
  -> Cornerstone viewport/actors
```

Un `MedicalViewState` invalido, non coerente con il volume residente o privo di
evidenza necessaria non deve produrre un raster apparentemente valido. Nessun
controller globale, row id, cell id o preset primario può fungere da fallback.

### D5 — RenderTarget vero, non ingrandimento di preview

La formula fisica recuperata da MedCanvas è utile:

```text
pixels = round(mm / 25.4 * DPI)
```

Ma il `highResRasterizer.ts` di MedCanvas disegna `panelPublicationRaster` su
un canvas 2D. Questo è un compositore di preview, non un re-render medicale ad
alta risoluzione. Non va portato in P3.5 e non può essere usato come evidenza
di qualità medicale.

P3.5 deve creare un target temporaneo Cornerstone/offscreen, applicare lo stesso
stato e lo stesso percorso di renderer dell'ordinary capture, estrarre un
buffer nativo alle dimensioni richieste e distruggere il target. Il canvas live,
la sua dimensione, camera e aspect ratio non devono essere modificati.

La distinzione PDF ibrido versus TIFF/PNG appartiene a Fase 5. In P3.5 si
restituisce esclusivamente il raster medicale.

## Matrice di recupero e azione

| Slice | Evidenza MedCanvas | Recuperare | Azione NuClear | Non trasferire |
|---|---|---|---|---|
| P3.3 | `volumeRefRegistry.ts`, `volumeCacheManager.ts`, `cornerstoneVolumeCacheAdapter.ts`; `vram_selective_purge.test.js`, `study_row_volume_binding.test.js` | retain idempotente, release sicuro, reference sharing, `releaseSlot`, pending retain, selective purge, ordine transazionale, fusion con due volumi | progettare `ResourceManager` con lease/consumer, residency osservabile, demand reconciliation, budget, eviction e reload; riscrivere i test in Node puro e harness reale dove necessario | `slotId`, `cellId`, `rowId`, controller, pool, layout, React, `cache.purgeCache()` |
| P3.4 | `fusionBlender.ts`, `rowRadiometry.ts`, `rendering-presets/src/{ct,pet,fusion}.ts`; `multi_row_radiometric_independence.test.js`, `row_suv_scale_isolation.test.js` | curva PET 0.42, mapping piecewise e guard, CT soft tissue W400/L40, PET range/colormap, indipendenza dei consumatori, CT underlay + PET overlay, fail-closed quantitation | implementare preset dichiarativi e `MedicalViewState` application in `medical-engine`; collegare solo evidenza worker e volumi residenti; catturare raster medicale ordinario | resolver per riga, fallback globali, `active*` controller fields, inferenza actor da stringhe legacy, nuove formule SUV/geometry |
| P3.4 | `mprManager.ts`, `mprSlotEnumerator.ts`, `mipController.ts`; `mpr_slot_enumerator.test.js`, `mip_rotation_and_palettes.test.js` | mapping `Average`/`Maximum`/`Minimum`, slab thickness, orientamento, MIP come projection state, dedup fisico | testare `ProjectionState` e applicazione Cornerstone sul viewport target; mantenere MIP come modalità di proiezione, non asset speciale | enumerazione di celle, allineamento tra righe, azimuth UI, label anatomiche UI, stato `activeSliceZ` |
| P3.4 | `serializer.ts`, `viewportSerializer.ts`, `viewportRestorer.ts`; test dynamic restore e round-trip | round-trip deterministico, stato proprio del target, no substitution, provenance per sorgente, readiness failure esplicito | creare `applyMedicalViewState`/`captureMedicalRaster` UI-agnostici con confronto state/provenance e negative tests | forma legacy `MedicalViewportState`, `viewports` keyed by cell, restore globale, `applyAllPresets()`, retry UI |
| P3.5 | `highResRasterizer.ts`, `pdfVectorExporter.ts`, `pdf_export.test.js` | dimensionamento mm/DPI, separazione raster/vettori come requisito futuro, output medicale senza chrome | implementare `TemporaryRenderTarget` offscreen Cornerstone e test di dimensione, equivalenza di stato, non-mutazione e disposal | canvas 2D che usa preview raster, composizione sheet, PDF object assembly, browser download |

## Preconditions operative

Prima di delegare P3.3:

- P3.2.1 deve restare verde con il renderer harness e i payload CT/PT attuali;
- il piano P3.2 deve continuare a essere l'unico ingresso per volume validato;
- deve essere definito il nome del resource key (`volumeId` del piano o un
  wrapper che lo associa a `assetId` e digest), senza introdurre slot;
- il test manager deve poter usare un cache adapter mock deterministico, come il
  test MedCanvas, oltre all'adapter Cornerstone reale;
- il budget VRAM non va inventato: usare misure disponibili e rappresentare come
  unknown ciò che il backend non espone.

Prima di P3.4:

- P3.3 deve dimostrare share/evict/reload e lasciare il volume in stato
  render-ready in modo osservabile;
- va chiusa la discrepanza `PetQuantitationResult.units` versus
  `asset.metadata.pet.units`;
- va chiusa la discrepanza semantica Bq/mL versus `g/mL` dei fixture PET;
- `@nuclear/rendering-presets` deve avere una superficie dichiarativa senza
  fallback clinici silenziosi;
- devono esistere fixture di `MedicalViewState` CT, PET e fusion con provenance.

Prima di P3.5:

- P3.4 deve poter applicare e catturare uno stato noto in modo ordinario;
- il target deve essere allocabile e interrogabile nel controlled WebGL harness;
- la dimensione fisica del pannello/target deve essere disponibile in mm;
- la policy di disposal e il comportamento in caso di allocation failure devono
  essere typed e testabili.

## Acceptance tests richiesti

### P3.3 — ResourceManager

Test puri, senza DOM:

1. `retain` duplicato dello stesso lease è idempotente;
2. due lease sullo stesso volume impediscono eviction finché uno solo viene
   rilasciato;
3. una fusion trattiene CT e PET separatamente;
4. `retain(new) -> release(removed) -> evict` evita l'eviction transitoria di una
   risorsa riutilizzata;
5. una richiesta pending viene trattenuta prima dell'eviction;
6. eviction rimuove solo risorse a zero lease e conserva asset/provenance;
7. reload ricostruisce lo stesso volume key da piano validato;
8. ordinamento di eviction rispetta priorità dichiarata e accesso deterministico;
9. budget insufficiente produce esito typed senza riportare `gpu-resident` falso;
10. errore loader, enumerazione o purge non cancella l'identità semantica e non
    viene trasformato in successo.

Test controlled renderer:

- load → demand gpu-ready/gpu-resident → release → evict → demand → reload;
- condivisione di un volume reale tra due consumer;
- nessuna entry Cornerstone residua dopo eviction confermata;
- disponibilità `missing`, `mismatch` e `offline-cached` non produce live volume.

### P3.4 — state application, radiometry e capture

Positive:

1. stato CT con preset Soft Tissue applica VOI W400/L40 al volume corretto;
2. stato PET con range dichiarato e colormap dichiarata applica VOI/mapping al
   volume PET corretto;
3. fusion applica CT come underlay e PET come overlay, con opacity
   `pow(slider / 100, 0.42)` e mapping selezionato;
4. mapping `highlighted` e `alpha` rispetta punti, clamp e gamma della specifica;
5. `ProjectionState` slice/MIP/MinIP/Average applica il blend mode e lo slab
   dichiarati;
6. lo stesso `MedicalViewState` produce ordinary capture con provenance e
   dimensioni coerenti;
7. capture/restore round-trip conserva source binding, camera, presentation,
   projection, composition e trasformazioni entro la tolleranza dichiarata;
8. due state indipendenti non si contaminano attraverso preset o cache globali.

Negative/fail-closed:

- quantitation assente, non computed, unità non BQML, fattore nullo/non finito o
  domain diverso da `rescaled-bqml`;
- range PET invertito, slider fuori [0,100], gamma non positivo, NaN/Infinity;
- asset/volume non residente, availability non online o provenance incoerente;
- binding CT/PET mancante o Frame of Reference/geometry non compatibile;
- state incompleto o coordinate transform invalide;
- applicazione al target sbagliato o mancata disponibilità di actor;
- qualunque failure non deve restituire un raster plausibile senza diagnostic.

### P3.5 — temporary high-resolution RenderTarget

1. `round(mm / 25.4 * dpi)` produce dimensioni esatte a 300 e 600 DPI;
2. target 8×8 cm a 600 DPI produce 1890×1890 pixel;
3. target usa lo stesso `MedicalViewState`, preset e provenance della capture
   ordinaria;
4. il target restituisce un buffer nativo non vuoto alle proprie dimensioni;
5. dimensioni, camera, aspect ratio e stato del live viewport sono byte/valore
   invarianti prima e dopo l'export;
6. disposal libera il target e le risorse temporanee anche dopo errore di render;
7. allocation failure è esplicito e non ripiega su upscaling di preview;
8. la richiesta `TemporaryRenderTargetSpec` rifiuta dimensioni non positive,
   DPI non valido e policy diversa da `never-resize-live-canvas`.

## Esclusioni esplicite

Non importare da MedCanvas:

- `MedicalViewportController`, controller types, row/cell identity, pool node,
  grid layout o qualunque resolver globale;
- React, hook, DOM interaction, portal, HUD, tool bindings o download path;
- `MedicalViewportState` legacy come nuovo contratto NuClear;
- `highResRasterizer.ts` o qualunque composizione da `panelPublicationRaster`;
- `pdfVectorExporter.ts` come implementazione del medical renderer;
- formule di geometria DICOM, resampling, registration o SUVbw in TypeScript;
- fallback a preset primario, source diverso, preview cached o viewport diverso;
- modifiche a P3.2.1, al Python worker o ai piani esistenti per aggirare un test
  fallito.

P3 continua a escludere figure-sheet composition, annotations, TIFF/PNG
flattening, hybrid PDF, Viewer/Composer placement e produzione UI. Questi
risultati vengono consumati da Fase 4/5 tramite contratti, non implementati qui.

## Sequenza OpenCode raccomandata

Eseguire slice separate e usare questo addendum come brief aggiuntivo:

1. **P3.3-A — pure ResourceManager contract/state machine**: definire lease,
   residency snapshot, budget outcome, typed errors e test puri. Nessun
   Cornerstone import nel core della state machine.
2. **P3.3-B — Cornerstone residency adapter**: collegare load/share/evict/reload
   al volume binding esistente; aggiungere controlled renderer evidence.
3. **P3.3-C — review/QA**: verificare che nessun semantic asset sia cancellato
   da eviction e che non esista purge globale.
4. **P3.4-A — radiometry/presets preflight**: chiudere prima le due incoerenze
   PET (`units` e Bq/mL versus g/mL). Se serve cambiare un boundary pubblico,
   creare ADR prima del codice.
5. **P3.4-B — MedicalViewState application**: applicare stato, composition,
   projection e preset al viewport scelto, con test CT/PT/fusion e negative
   fail-closed.
6. **P3.4-C — ordinary capture e review**: catturare solo il raster medicale e
   verificare provenance, no-fallback e isolamento tra state.
7. **P3.5-A — temporary target primitive**: implementare dimensionamento,
   target offscreen, readback e disposal nel medical-engine.
8. **P3.5-B — render equivalence/negative tests**: confrontare lo stato
   applicato con ordinary capture, provare 300/600 DPI, live-canvas invariance,
   allocation failure e cleanup.
9. **P3.6**: includere nel report solo evidenze reali delle slice sopra; non
   dichiarare completata una slice perché esistono soltanto contratti o mock.

Ogni delega deve ribadire: package owner `@nuclear/medical-engine` (e
`@nuclear/rendering-presets` quando applicabile), allowlist dei path, nessun UI,
nessun view-engine/figure-engine, nessun stage/commit/push e stop `BLOCKED` se
Cornerstone o una misura di residency non sono verificabili.

## File consultati

NuClear:

- `AGENTS.md`;
- `docs/PROJECT_VADEMECUM.md`;
- `docs/NUCLEAR_ARCHITECTURE_V3.md`;
- `docs/plans/PHASE_3_MEDICAL_ENGINE_PLAN.md`;
- `docs/plans/PHASE_3_OPENCODE_RUNBOOK.md`;
- `docs/plans/PET_CT_FUSION_RADIOMETRY_SPEC.md`;
- `packages/shared-types/src/{asset,availability,figure,prepared-view,view-state}.ts`;
- `packages/medical-engine/src/renderer/{adapter,volume,volume-binding,volume-types}.ts`;
- `packages/medical-engine/src/worker/{mapping-quantitation,types}.ts`;
- `tests/rendering/{volume-ingestion,volume-payload-validation,volume-construction,volume-load}.test.ts`;
- `tests/contracts/{clinical-data-contracts,figure-contracts,view-contracts}.test.ts`.

MedCanvas:

- `AGENTS.md`;
- `packages/medical-engine/src/{volumeRefRegistry,volumeCacheManager,cornerstoneVolumeCacheAdapter}.ts`;
- `packages/medical-engine/src/{fusionBlender,rowRadiometry,mprManager,mprSlotEnumerator,mipController}.ts`;
- `packages/medical-engine/src/{serializer,viewportSerializer,viewportRestorer}.ts`;
- `packages/rendering-presets/src/{ct,pet,fusion}.ts`;
- `packages/ui/src/components/canvas/export/{highResRasterizer,pdfVectorExporter}.ts`;
- `tests/unit/{vram_selective_purge,study_row_volume_binding,multi_row_radiometric_independence,row_suv_scale_isolation,mpr_slot_enumerator,mip_rotation_and_palettes,dynamic_viewport_restore,pdf_export}.test.js`;
- `docs/decisions/ADR-005-dynamic-clinical-grid-slot-pool-vram.md` e
  `docs/agentlog/M4.md`/`M5.md`/`M6.1.md` per i comportamenti recuperati.

## Esito del recupero

Il recupero non richiede di fermare o riscrivere P3.2.1. Richiede di
iniziare P3.3 con un `ResourceManager` nuovo che formalizzi le invarianti già
dimostrate da MedCanvas, poi di usare P3.4 per ratificare la radiometria e lo
stato medicale headless, e infine di implementare P3.5 come re-render reale su
target temporaneo. Il vecchio cache registry è una buona fonte di test e
sequenza transazionale; il vecchio serializer è una buona fonte di invarianti;
il vecchio high-resolution rasterizer è invece una contro-evidenza da non
riutilizzare.
