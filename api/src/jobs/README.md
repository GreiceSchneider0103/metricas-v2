# jobs

Um arquivo por job -- nunca mais um worker-service.ts de 5600 linhas com 7 dominios misturados.

- ml-sync-account.ts   (fase 1: OAuth refresh + sync listings/orders)
- listing-daily-snapshot-aggregate.ts   (fase 2: le orders/order_items/listings do dia -> escreve listing_daily_snapshot)
- alerts-evaluate.ts   (fase 6: le listing_daily_snapshot -> escreve alerts)
- runner.ts   (dispatch + bookkeeping em job_runs; JOB_EXECUTION_MODE=direct por padrao, sem Redis/BullMQ)
