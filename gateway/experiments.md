# Relatório de Experimento: Baseline de Latência e Resiliência (Gateway)

---

## 1. Metodologia do Experimento

### 1.1 Configuração do Ambiente (Setup)
* **Edge (Vision Client)**: Executando `vision/src/client.py` com vídeo de teste contendo 44 vagas demarcadas. Configurado para conectar-se exclusivamente ao gateway local.
* **Gateway**: Executando `gateway/gateway.py` na porta `8001`, com banco de dados SQLite para cache de eventos (`local_fallback.db`) e auditoria de métricas (`metrics.db`).
* **Cloud (Backend Rust)**: Servidor Axum simulando a nuvem localmente na porta `8000`.

### 1.2 Roteiro do Teste
1. **Inicialização**: Conectar todos os componentes e verificar a transmissão bem-sucedida em estado de rede ativa.
2. **Queda de Conexão**: Desligar o Servidor Rust (porta `8000`) por um período aproximado de 2 minutos para simular indisponibilidade de internet, mantendo a visão computacional ativa e enviando detecções.
3. **Restabelecimento**: Ligar novamente o Servidor Rust e aguardar a reconexão automática e o escoamento (sincronização) do lote de eventos acumulados.
4. **Coleta de Dados**: Extração dos timestamps do banco `metrics.db`.

---

## 2. Resultados da Baseline

* **Total de Eventos Processados**: 213
* **Latência LAN Estável (Edge → Gateway)**: 1.0 ms
* **Latência LAN Média Geral**: 4378.30 ms *(afetada pelo gargalo de rajada inicial)*
* **Tempo Médio de Fila no Gateway**: 10755.69 ms *(tempo em buffer decorrente da queda de rede e gargalo de I/O)*
* **Duração Máxima da Queda de Rede Suportada (Buffer SQLite)**: 124.16 segundos
* **Taxa de Entrega de Mensagens (Cloud Ack)**: 100% (todas as 213 mensagens reconciliadas com sucesso)

---

## 3. Análise do Gargalo Identificado

Durante a inicialização do Edge, 44 mensagens (uma para cada vaga) são enviadas em rajada. O Gateway apresentou latência acumulada nesse instante por realizar escritas em disco de forma síncrona e bloqueante no loop de eventos assíncronos:

```
Rajada inicial (44 mensagens) ──▶ [Gateway recv loop] 
                                       │
                                       ├─▶ save_event() ──▶ SQLite Sync/Commit (síncrono ~50ms)
                                       └─▶ save_metric() ─▶ SQLite Sync/Commit (síncrono ~50ms)
```

Cada mensagem resultava em dois bloqueios síncronos de escrita (~100ms no total), empilhando as mensagens pendentes no buffer TCP e gerando latências artificiais de até 4.3 segundos para as primeiras mensagens da rajada. Eventos individuais posteriores (fora da rajada) mantiveram a latência ideal de **1 ms**.

---

## 4. Próximos Passos (Melhorias Planejadas)

* Reutilização de conexões SQLite ativas (evitando o overhead de abrir e fechar o banco a cada escrita).
* Ativação do modo **WAL** (*Write-Ahead Logging*) no SQLite via `PRAGMA journal_mode=WAL;` para otimizar a concorrência e a velocidade de escrita.
* Agrupamento das inserções da rajada inicial em uma única transação SQL.
