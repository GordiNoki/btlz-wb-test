import { z } from "zod/v4";

export const zDBSpreadsheets = z.object({
    spreadsheet_id: z.string(),
});
export type DBSpreadsheets = z.infer<typeof zDBSpreadsheets>;

export type DBSettings = { id: number; google_refresh_token: string };

export const zBoxTariffs = z.object({
    boxDeliveryAndStorageExpr: z.string(),
    boxDeliveryBase: z.string(),
    boxDeliveryLiter: z.string(),
    boxStorageBase: z.string(),
    boxStorageLiter: z.string(),
    warehouseName: z.string(),
});
export type BoxTariffs = z.infer<typeof zBoxTariffs>;

export type DBBoxTariffs = BoxTariffs & { date: Date };

export const zBoxTariffsData = z.object({
    response: z.object({
        data: z.object({
            dtNextBox: z.string(),
            dtTillMax: z.string(),
            warehouseList: z.array(zBoxTariffs),
        }),
    }),
});

export const zBoxTariffsError = z.object({
    title: z.string(),
    detail: z.string(),
});
