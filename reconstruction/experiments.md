# Experiments — Reconstrução 3D do Estacionamento

> Documento de rastreamento técnico da pipeline de reconstrução 3D para o projeto **Estaciona AI**.
> Cobre o período de **Abril a Maio de 2026**, detalhando as abordagens testadas, gargalos de hardware enfrentados, mudanças de rumo e a solução final adotada para o protótipo de apresentação.

---

## Sumário

- [1. Contexto e Objetivo](#1-contexto-e-objetivo)
- [2. Hardware e Restrições](#2-hardware-e-restrições)
- [3. Fase 1 — Pipeline COLMAP + 3DGS (Abril–Maio 2026)](#3-fase-1--pipeline-colmap--3dgs-abrilmaio-2026)
  - [3.1 Configuração do Ambiente para Blackwell](#31-configuração-do-ambiente-para-blackwell)
  - [3.2 SfM com COLMAP via Docker](#32-sfm-com-colmap-via-docker)
  - [3.3 Treinamento Splatfacto — Iterações e Crashes](#33-treinamento-splatfacto--iterações-e-crashes)
  - [3.4 Exportação do Modelo 3DGS](#34-exportação-do-modelo-3dgs)
- [4. Fase 2 — Pivô para RealityScan (Maio 2026)](#4-fase-2--pivô-para-realityscan-maio-2026)
  - [4.1 Motivação da Troca](#41-motivação-da-troca)
  - [4.2 Tentativa com Distrobox no Linux](#42-tentativa-com-distrobox-no-linux)
  - [4.3 Mudança para Windows](#43-mudança-para-windows)
  - [4.4 Processamento e Exportação do Modelo](#44-processamento-e-exportação-do-modelo)
- [5. Fase 3 — Otimização e Exportação Final (22–23 Maio 2026)](#5-fase-3--otimização-e-exportação-final-2223-maio-2026)
  - [5.1 Gargalo de Memória na Importação do OBJ](#51-gargalo-de-memória-na-importação-do-obj)
  - [5.2 Crashes do Linux — Swap em HD Mecânico](#52-crashes-do-linux--swap-em-hd-mecânico)
  - [5.3 Solução de Processamento Headless via Blender CLI](#53-solução-de-processamento-headless-via-blender-cli)
  - [5.4 Pipeline Final de Exportação para GLB](#54-pipeline-final-de-exportação-para-glb)
- [6. Resultados Finais](#6-resultados-finais)
- [7. Conclusões e Lições Aprendidas](#7-conclusões-e-lições-aprendidas)

---

## 1. Contexto e Objetivo

O módulo `reconstruction/` é responsável por gerar a representação 3D digital do estacionamento monitorado pelo Estaciona AI. O modelo 3D é usado como base do mapa interativo no aplicativo, onde as vagas ocupadas/livres são sobrepostas em tempo real.

**Requisito funcional**: Obter um modelo 3D do estacionamento, com cores realistas e geometria fiel, exportado em um formato leve o suficiente para ser carregado em um visualizador web ou mobile (< 50MB).

**Dados de entrada**: 500 fotografias capturadas com câmera Canon (sensor 24MP, resolução 6014×4010) do estacionamento, datadas de 07/05/2026. Adicionalmente, um conjunto de fotos capturado por drone DJI foi processado via RealityScan.

---

## 2. Hardware e Restrições

| Componente        | Especificação                                                    |
| ----------------- | ---------------------------------------------------------------- |
| **GPU**           | NVIDIA RTX 5060 Ti — 16GB VRAM (Arquitetura Blackwell, `sm_120`) |
| **RAM**           | 16GB DDR                                                         |
| **ZRAM**          | 16GB (compressão em memória física)                              |
| **Swap**          | 24GB em HD mecânico (removido posteriormente)                    |
| **Armazenamento** | NVMe montado em `/mnt/data/`                                     |
| **SO**            | Arch Linux                                                       |
| **Blender**       | 5.1.0 (binário portátil em `~/Programs/blender/`)                |

> [!WARNING]
> **Restrição crítica de hardware**: A combinação de 16GB de RAM com um swap lento em HD mecânico (~100 MB/s) foi o principal gargalo do projeto. Qualquer operação que ultrapassasse ~24GB de uso de memória total (RAM + ZRAM) causava _thrashing_ de swap no HD, congelando o sistema operacional inteiro por minutos.

> [!IMPORTANT]
> **Arquitetura Blackwell (RTX 50-series)**: A GPU RTX 5060 Ti utiliza a Compute Capability `sm_120`, que na época dos experimentos ainda exigia builds nightly do PyTorch (`cu128`) e versões específicas do gsplat (`>=1.5.0`) para compilar os kernels CUDA corretamente. Isso adicionou uma camada significativa de complexidade ao setup do ambiente.

---

## 3. Fase 1 — Pipeline COLMAP + 3DGS (Abril–Maio 2026)

A primeira abordagem adotada foi a pipeline clássica de reconstrução neural baseada em **3D Gaussian Splatting (3DGS)**:

```
Fotos Canon (500×24MP) → COLMAP SfM → Nerfstudio Splatfacto → PLY Export
```

### 3.1 Configuração do Ambiente para Blackwell

O setup do ambiente foi documentado em `setup_3dgs.sh` e exigiu atenção especial devido à arquitetura Blackwell:

1. **Virtual environment dedicado** (`.venv_3dgs`) criado com `uv` usando Python 3.11 (exigência de compatibilidade do Nerfstudio).
2. **PyTorch Nightly** instalado a partir do índice `cu128` (CUDA 12.8) — necessário para suporte a `sm_120`.
3. **gsplat `>=1.5.0`** — versão mínima para compilação correta dos rasterizadores em Blackwell.
4. **Nerfstudio** — pipeline de treinamento do método `splatfacto`.

O commit `07cdb43` (17/04/2026) registra a adição de suporte explícito à RTX 5060 Ti, e o commit `6790c5d` (07/05/2026) consolida o pivô para o pipeline otimizado com Blackwell tuning.

### 3.2 SfM com COLMAP via Docker

O COLMAP foi executado via container Docker (`colmap/colmap:latest`) com acesso direto à GPU (`--gpus all`). A classe `ReconstructionRunner` em `src/pipeline/reconstruction.py` orquestra as três etapas do SfM:

| Etapa               | Configuração                                                                |
| ------------------- | --------------------------------------------------------------------------- |
| Feature Extraction  | SIFT GPU, `max_image_size=4000`, `max_num_features=8192`, `single_camera=1` |
| Sequential Matching | GPU, `overlap=10`                                                           |
| Sparse Mapping      | Output em `output/colmap/sparse/0/`                                         |

**Resultados do SfM**:

- `database.db`: 910MB (banco de features e matches)
- `cameras.bin`: 120 bytes (modelo de câmera único)
- `images.bin`: 131.7MB (poses de câmera para todas as 500 imagens)
- `points3D.bin`: 33.8MB (nuvem de pontos esparsa)

O SfM foi completado com sucesso e gerou dados de calibração válidos para o treinamento 3DGS.

### 3.3 Treinamento Splatfacto — Iterações e Crashes

Foram realizados **14 runs de treinamento** ao longo de duas semanas (07/05 a 21/05), com a maioria deles crashando nos primeiros minutos de execução por estouro de memória (RAM ou VRAM). A tabela abaixo resume a evolução dos parâmetros críticos ao longo dos runs:

| Parâmetro                  | Runs 1–3 (07/05) | Runs 7–8 (07/05) | Runs 10–11 (18–19/05) | **Run 14 — ✅ Sucesso (21/05)** |
| -------------------------- | ---------------- | ---------------- | --------------------- | ------------------------------- |
| `cache_images`             | `gpu`            | `gpu`            | `cpu`                 | **`cpu`**                       |
| `images_on_gpu`            | `true`           | `true`           | `false`               | **`false`**                     |
| `downscale_factor`         | `null` / `1`     | `2`              | `1` / `2`             | **`4`**                         |
| `camera_optimizer`         | `off`            | `off`            | `off`                 | **`SO3xR3`**                    |
| `enable_collider`          | `true`           | `true`           | `true`                | **`false`**                     |
| `rasterize_mode`           | `classic`        | `classic`        | `classic`             | **`antialiased`**               |
| `densify_grad_thresh`      | `0.0008`         | `0.0008`         | `0.0001`              | **`0.0004`**                    |
| `max_gauss_ratio`          | `10.0`           | `10.0`           | `10.0`                | **`5.0`**                       |
| `stop_split_at`            | `15000`          | `15000`          | `15000`               | **`20000`**                     |
| `use_scale_regularization` | `false`          | `false`          | `false`               | **`true`**                      |
| `vis`                      | `viewer+tb`      | `viewer+tb`      | `viewer+tb`           | **`tensorboard`**               |

#### Causas dos crashes e soluções iterativas

1. **Runs 1–3 (07/05, grupo `output`)**: Crashes imediatos. `cache_images: gpu` com 500 fotos em resolução total (6014×4010×3 = ~72MB por frame) tentava carregar ~36GB de dados de imagem diretamente na VRAM de 16GB. Os arquivos `tfevents` de 0 bytes confirmam que o processo morria antes de registrar qualquer iteração.

2. **Runs 4–6 (07/05, grupo `unnamed`)**: Mesma configuração base. Tentativas com `downscale_factor: 1` (resolução total) mantiveram o estouro de RAM. Arquivos `tfevents` de 88 bytes indicam crash durante a primeira iteração.

3. **Runs 7–8 (07/05, grupo `estaciona-canon`)**: Introdução de `downscale_factor: 2` (3007×2005), reduzindo o footprint de imagem para ~9GB. Ainda crashava por manter `cache_images: gpu` e `images_on_gpu: true`.

4. **Runs 10–11 (18–19/05, grupo `estaciona-max-quality`)**: Mudança para `cache_images: cpu` e `images_on_gpu: false` — tirando as imagens da VRAM. Entretanto, `downscale_factor: 1` (run 10) e `densify_grad_thresh: 0.0001` (muito agressivo) causavam explosão no número de Gaussians, estourando a VRAM durante a densificação.

5. **Run 12 (20/05, grupo `estaciona`)**: Primeira configuração com `camera_optimizer: SO3xR3`, `rasterize_mode: antialiased`, `enable_collider: false`. Crash persistiu, mas provavelmente por `downscale_factor: 2` ainda ser pesado demais com 500 fotos.

6. **Run 14 (21/05) — ✅ SUCESSO**: Configuração final equilibrada documentada em `train.sh`. O `downscale_factor: 4` reduziu cada imagem para 1503×1002 (~4.5MB por frame, ~2.25GB total para 500 imagens), cabendo confortavelmente nos 16GB de RAM. O treino rodou **30.000 iterações completas**, gerando um checkpoint de 975MB (`step-000029999.ckpt`) e um arquivo TensorBoard de 855MB.

**Budget de memória estimado do run bem-sucedido** (documentado em `train.sh`):

```
RAM:  500 imgs × 1503×1002 × 3 (uint8) ≈ 2.25GB — cabe nos 16GB
VRAM: ~14GB disponíveis para Gaussians + rasterização (de 16GB totais)
```

### 3.4 Exportação do Modelo 3DGS

Após o treinamento bem-sucedido, o modelo foi exportado para PLY via `export.sh`:

- **Output**: `exports/splat.ply` (337MB)
- O script `export_fix.py` foi necessário para contornar um bug do Nerfstudio: os checkpoints usam `pickle` para serialização, mas as versões recentes do PyTorch passaram a exigir `weights_only=True` por padrão em `torch.load`. O fix faz monkey-patch de `torch.load` para usar `weights_only=False`.

> [!NOTE]
> O modelo 3DGS (`.ply`) produzido nesta fase é uma nuvem de Gaussians, não uma malha poligonal tradicional. Para o protótipo de apresentação, optou-se por um modelo de malha com cores nos vértices (exportado pelo RealityScan) por ser mais compatível com visualizadores web convencionais (Three.js / glTF).

---

## 4. Fase 2 — Pivô para RealityScan (Maio 2026)

### 4.1 Motivação da Troca

Apesar do sucesso do treinamento 3DGS, a qualidade visual do modelo exportado como `.ply` não atingiu o nível desejado para o protótipo de apresentação. Os principais problemas foram:

- **Artefatos de flutuação** (_floaters_): Gaussians "fantasma" flutuando no ar ao redor da cena. Resultado de o `densify_grad_thresh` e `cull_alpha_thresh` não filtrarem adequadamente no espaço aberto do estacionamento.
- **Renderização limitada**: A visualização de Gaussian Splatting exige viewers especializados (como o Viewer do Nerfstudio ou implementações WebGL específicas), não sendo trivialmente integrável em pipelines web convencionais baseadas em glTF/Three.js.
- **Tempo de iteração**: Cada tentativa de treinamento consumia entre 2 e 4 horas, mais o tempo de COLMAP, tornando o ciclo de experimentação extremamente lento.

A decisão foi adotar o **RealityScan** (aplicação de fotogrametria da Epic Games) como alternativa para gerar diretamente uma malha poligonal texturizada a partir das fotos do drone DJI.

### 4.2 Tentativa com Distrobox no Linux

O RealityScan Desktop é uma aplicação exclusiva para Windows. A primeira tentativa de contornar essa limitação foi via **Distrobox** (ferramenta que cria containers Linux com acesso nativo à GPU e ao display do host):

- Criou-se um container Ubuntu com acesso ao driver NVIDIA e ao display X11/Wayland.
- O RealityScan foi instalado via Wine/Proton dentro do container.
- **Resultado**: A aplicação não inicializou corretamente. O RealityScan depende de componentes DirectX 12 e APIs proprietárias de upload para a nuvem da Epic Games que não funcionam em camadas de compatibilidade Linux. O processamento pesado de fotogrametria é feito nos servidores da Epic (cloud-based), e a autenticação/upload falhou consistentemente.

### 4.3 Mudança para Windows

Diante da incompatibilidade com Linux, o processamento foi realizado em uma instalação Windows (dual-boot ou máquina separada):

1. As fotos do drone DJI foram transferidas para o ambiente Windows.
2. O RealityScan Desktop processou as imagens e fez upload para os servidores da Epic Games para a reconstrução fotogramétrica na nuvem.
3. O modelo foi reconstruído nos servidores da Epic e baixado como arquivo `.obj`.

### 4.4 Processamento e Exportação do Modelo

O RealityScan (v2.1.1.119166) gerou o modelo `dji_1_LOD0.obj`:

| Propriedade            | Valor                                      |
| ---------------------- | ------------------------------------------ |
| **Tamanho do arquivo** | 1.54GB (formato texto OBJ)                 |
| **Vértices**           | 11.265.072                                 |
| **Faces**              | 22.530.184 (triângulos)                    |
| **Coordenadas UV**     | Não exportadas                             |
| **Texturas**           | Nenhuma (cores armazenadas nos vértices)   |
| **Normais**            | Não exportadas (`exportVertexNormals="0"`) |
| **Sistema de coord.**  | Euclidiano local                           |
| **Engine**             | RealityScan v2.1.1.119166                  |

O arquivo `.mtl` associado contém apenas um material branco genérico (`Kd 1 1 1`), confirmando que toda a informação de cor reside exclusivamente nos atributos de vértice da malha.

---

## 5. Fase 3 — Otimização e Exportação Final (22–23 Maio 2026)

### 5.1 Gargalo de Memória na Importação do OBJ

A primeira tentativa de abrir o arquivo `dji_1_LOD0.obj` (1.54GB) diretamente na interface gráfica do Blender 5.1.0 resultou em consumo catastrófico de recursos:

- **VRAM**: ~15GB (de 16GB disponíveis) — o Blender tentava renderizar 22.5 milhões de triângulos no viewport em tempo real.
- **RAM**: >24GB — a conversão do formato texto `.obj` para as estruturas internas do Blender (BMesh) multiplica o uso de memória por ~15x em relação ao tamanho do arquivo.

Como o sistema possui apenas 16GB de RAM física + 16GB de ZRAM, o excesso de 8GB era descarregado no swap de 24GB hospedado em um **HD mecânico**. A velocidade de leitura/escrita do HD (~100 MB/s vs. ~40.000 MB/s da RAM) causava _thrashing_ severo, congelando completamente o sistema operacional por períodos de 2 a 5 minutos a cada operação no viewport.

### 5.2 Crashes do Linux — Swap em HD Mecânico

Os crashes se manifestavam em dois cenários críticos:

1. **Crash na importação**: O processo de parsing do OBJ de 1.54GB em modo texto gerava picos de alocação de memória que ultrapassavam a capacidade combinada de RAM + ZRAM, forçando o kernel a usar o swap do HD. O OOM Killer do Linux ocasionalmente matava o processo do Blender.

2. **Crash no Edit Mode**: Mesmo após importação bem-sucedida, qualquer operação de seleção em lote (Box Select com `B`) no Edit Mode do Blender gerava um snapshot de Undo na RAM com os dados de todos os 11.2 milhões de vértices. Esse pico instantâneo de alocação (~4GB em microssegundos) causava crash imediato por OOM.

**Solução aplicada**: Remoção completa do swap no HD mecânico, mantendo exclusivamente a ZRAM (compressão em memória física):

```bash
sudo swapoff /mnt/data/swapfile
sudo rm -f /mnt/data/swapfile
sudo sed -i '\|/mnt/data/swapfile|d' /etc/fstab
```

**Estado final do swap**:

```
NAME       TYPE      SIZE  USED PRIO
/dev/zram0 partition  16G 15.5G  100
```

Essa mudança eliminou o _thrashing_ de disco. O sistema passou a gerenciar a pressão de memória exclusivamente na ZRAM ultrarrápida, permitindo que o Blender utilizasse efetivamente ~24GB de memória virtual (16GB RAM + ~8GB comprimidos na ZRAM) sem travar o SO.

### 5.3 Solução de Processamento Headless via Blender CLI

Para contornar os crashes da interface gráfica do Blender, toda a pipeline de decimação e exportação foi executada via **Blender em modo headless** (`--background`), eliminando 100% do consumo de VRAM (sem viewport rendering) e reduzindo significativamente o overhead de RAM (sem GUI, Undo, ou BMesh display buffers).

#### Script `converter.py` — Importação e Decimação Inicial

```bash
blender --background --python converter.py
```

- Detecta automaticamente o maior arquivo `.obj` no diretório.
- Importa via C++ OBJ Importer nativo do Blender 5.x (até 100x mais rápido que o importador Python legado).
- Aplica modificador Decimate com `ratio=0.5` (50%), reduzindo para ~5.6M vértices.
- Aplica Shade Smooth para suavização visual.
- Salva como `.blend` nativo para carregamento instantâneo em sessões futuras.

> [!NOTE]
> **Incompatibilidade de API do Blender 5.1.0**: O parâmetro `import_vertex_colors` do operador `bpy.ops.wm.obj_import()` foi removido nesta versão. Essa incompatibilidade silenciosa entre a documentação da API do Blender 4.x e o runtime do 5.x causou um erro de `TypeError` na primeira execução, exigindo inspeção dinâmica das propriedades via `bpy.ops.wm.obj_import.get_rna_type().properties.keys()`.

#### Script `export_optimized.py` — Decimação Agressiva + Exportação GLB

```bash
blender melhorresultado.blend --background --python export_optimized.py
```

- Abre o arquivo `.blend` contendo o modelo já cortado e alinhado manualmente.
- Aplica Decimate com `ratio=0.05` (5%), reduzindo de 11.2M para **518.965 vértices**.
- Exporta como glTF Binary (`.glb`) com **compressão Draco** nível 6.

> [!NOTE]
> **Duas incompatibilidades de API encontradas na exportação glTF do Blender 5.1.0**:
>
> 1. O enum `export_format` mudou de `'GLTF_BINARY'` (Blender 4.x) para `'GLB'`.
> 2. O parâmetro `export_vertex_color` mudou de booleano (`True`/`False`) para enum (`'MATERIAL'` | `'ACTIVE'` | `'NAME'` | `'NONE'`).
>
> Ambos foram diagnosticados via introspecção em runtime:
>
> ```python
> bpy.ops.export_scene.gltf.get_rna_type().properties['export_vertex_color'].enum_items
> # → ['MATERIAL', 'ACTIVE', 'NAME', 'NONE']
> ```

### 5.4 Pipeline Final de Exportação para GLB

O pipeline final de exportação é executado inteiramente em modo headless e leva aproximadamente **8 minutos** no hardware descrito:

```
melhorresultado.blend (593MB)
    ↓ Blender CLI (--background)
    ↓ Decimate Modifier (ratio=0.05)
    ↓ 11.2M vértices → 518.965 vértices
    ↓ glTF 2.0 Export (GLB Binary)
    ↓ Draco Compression (level=6)
    ↓ Vertex Colors: ACTIVE
melhorresultado_otimizado.glb (30MB)
```

**Métricas de compressão Draco** (output do encoder):

```
DracoEncoder | Vertices: 3,113,346 | Indices: 3,114,018
DracoEncoder | Raw size:     112,082,920 bytes (106.9MB)
DracoEncoder | Encoded size:  30,587,236 bytes (29.2MB)
DracoEncoder | Compression ratio: 3.66x
```

**Perfil de consumo de recursos durante a execução**:

- CPU: 100% de um núcleo durante ~5 minutos (fase de Decimate), seguido de ~3 minutos na exportação.
- RAM: Pico de 11.8GB de RAM física + 9.1GB de ZRAM (~20.9GB efetivos).
- VRAM: 0GB (modo headless não utiliza GPU para rendering).
- Disco: Gravação única de 30MB ao final do processo.

---

## 6. Resultados Finais

### Comparativo de Saídas

| Propriedade                  | OBJ Original (RealityScan) | PLY (3DGS)                    | **GLB Final (Protótipo)**                         |
| ---------------------------- | -------------------------- | ----------------------------- | ------------------------------------------------- |
| **Formato**                  | Wavefront OBJ (texto)      | PLY (binário)                 | glTF Binary + Draco                               |
| **Tamanho do arquivo**       | 1.54GB                     | 337MB                         | **30MB**                                          |
| **Vértices**                 | 11,265,072                 | N/A (Gaussians)               | **518,965**                                       |
| **Faces**                    | 22,530,184                 | N/A                           | **~1,037,930**                                    |
| **Tipo de cor**              | Vertex Colors              | SH Coefficients               | Vertex Colors (ACTIVE)                            |
| **Compatibilidade Web**      | ❌ Não (texto, pesado)     | ❌ Exige viewer especializado | **✅ Three.js, Babylon.js, qualquer viewer glTF** |
| **Tempo de carregamento**    | >60s + crash               | Variável                      | **<2s**                                           |
| **Uso de RAM no viewer**     | >24GB                      | Variável                      | **~600MB**                                        |
| **Redução total de tamanho** | —                          | —                             | **98.1%**                                         |

### Arquivos Gerados

```
reconstruction/
├── exports/splat.ply                   # 337MB — Modelo 3DGS (Fase 1)
├── dji_1_LOD0.obj                      # 1.54GB — Malha bruta RealityScan (Fase 2)
├── dji_1_LOD0_otimizado.blend          # 564MB — Blender com Decimate 50%
├── melhorresultado.blend               # 593MB — Modelo cortado e alinhado manualmente
└── melhorresultado_otimizado.glb       # 30MB — ✅ Modelo final para apresentação (Fase 3)
```

---

## 7. Conclusões e Lições Aprendidas

### Gargalos Técnicos Identificados

1. **RAM é o recurso mais crítico em pipelines de reconstrução 3D**, não a VRAM. A maioria dos crashes ocorreu por estouro de memória do sistema (OOM), não por limitação da GPU. Em hardware com 16GB de RAM, o `downscale_factor` e o `cache_images` mode são os parâmetros mais impactantes na viabilidade do treinamento.

2. **Swap em HD mecânico é contraproducente para cargas de trabalho 3D**. A latência de 10ms do HD (vs. ~70ns da RAM) causa _thrashing_ que torna o sistema completamente inutilizável. A ZRAM (compressão em memória física) provou ser uma alternativa radicalmente superior, oferecendo ~8GB adicionais de capacidade efetiva sem penalidade perceptível de performance.

3. **O formato OBJ é inadequado para modelos de alta resolução**. Como formato texto não compactado, um modelo de 11M vértices ocupa 1.54GB em disco e ~15GB na memória ao ser parseado. Formatos binários como PLY, FBX ou glTF/GLB são ordens de magnitude mais eficientes.

4. **APIs do Blender mudam silenciosamente entre versões major**. A transição do Blender 4.x para o 5.x alterou tanto o importador OBJ (`import_vertex_colors` removido) quanto o exportador glTF (`GLTF_BINARY` → `GLB`, `export_vertex_color` de bool para enum) sem erros de compilação — apenas `TypeError` em runtime. A introspecção dinâmica via `get_rna_type().properties` é essencial para scripts de automação cross-version.

### Decisões Arquiteturais

- **RealityScan > 3DGS para prototipagem rápida**: O RealityScan, apesar de exigir Windows e processamento em nuvem, produz malhas poligonais diretamente consumíveis por qualquer engine 3D web. O 3DGS produz resultados visuais superiores (especularidade, transparência, reflexos), mas exige viewers especializados e um ciclo de iteração significativamente mais longo.

- **Blender CLI como ferramenta de pipeline**: Executar o Blender em modo `--background` permite processar modelos que seriam impossíveis de manipular na interface gráfica, eliminando 100% do consumo de VRAM e reduzindo o overhead de RAM em ~40%.

- **Compressão Draco no glTF**: A compressão Draco nível 6 atingiu uma taxa de compressão de 3.66x na geometria, sem perda perceptível de qualidade visual no protótipo. Para a produção final, recomenda-se explorar o pipeline de _texture baking_ (projeção de detalhes do modelo High-Poly em texturas 2D sobre um modelo Low-Poly com UV mapping) para atingir qualidade fotorrealista com modelos de <50K vértices.
