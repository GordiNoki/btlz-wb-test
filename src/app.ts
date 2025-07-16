import knex, { migrate, seed } from "#postgres/knex.js";
import { google } from "googleapis";
import Fastify from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import env from "#config/env/env.js";
import z from "zod/v4";
import { zBoxTariffsError, zBoxTariffsData, DBSettings, DBSpreadsheets, BoxTariffs, zDBSpreadsheets, DBBoxTariffs } from "#schemas.js";
import { CronJob } from "cron";

await migrate.latest();
await seed.run();

console.log("All migrations and seeds have been run");

const oauth2Client = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URL);
google.options({ auth: oauth2Client });
const { spreadsheets } = google.sheets("v4");

const [settings] = await knex<DBSettings>("settings").select("google_refresh_token").where({ id: 0 });
if (!settings || !settings.google_refresh_token) {
    console.log("Couldn't load Google refresh token. Spreadsheets won't be updated before authentication");
} else {
    oauth2Client.setCredentials({ refresh_token: settings.google_refresh_token });
    console.log("Google refresh token loaded");
}

async function fillSheetWithBoxTariffs(spreadsheetId: string, tariffs: BoxTariffs[]) {
    const sortedData = tariffs.sort((a, b) => (parseInt(a.boxDeliveryAndStorageExpr) || 0) - (parseInt(b.boxDeliveryAndStorageExpr) || 0));
    const keys: Array<keyof BoxTariffs> = [
        "warehouseName",
        "boxDeliveryAndStorageExpr",
        "boxDeliveryBase",
        "boxDeliveryLiter",
        "boxStorageBase",
        "boxStorageLiter",
    ];
    const values = sortedData.map((ent) => keys.map((k) => ent[k]));
    await spreadsheets
        .batchUpdate({
            spreadsheetId,
            requestBody: {
                requests: [
                    {
                        addSheet: {
                            properties: {
                                title: "stocks_coefs",
                            },
                        },
                    },
                ],
            },
        })
        .catch(() => {}); // Ignore
    await spreadsheets.values
        .update({
            spreadsheetId,
            range: `stocks_coefs`,
            valueInputOption: "USER_ENTERED",
            requestBody: {
                majorDimension: "ROWS",
                values: [keys, ...values],
            },
        })
        .catch((e) => {
            console.error("Error while filling out sheet " + spreadsheetId, e);
        });
}

const app = Fastify().withTypeProvider<ZodTypeProvider>();

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

app.get("/auth", (_req, res) => {
    res.redirect(oauth2Client.generateAuthUrl({ access_type: "offline", scope: "https://www.googleapis.com/auth/spreadsheets" }));
});

app.get("/authreturn", { schema: { querystring: z.object({ code: z.string() }) } }, async (req, res) => {
    const { tokens } = await oauth2Client.getToken(req.query.code);
    if (!tokens.refresh_token) {
        res.send("No refresh token present. Revoke app permissions and try again. https://myaccount.google.com/u/0/permissions");
        return;
    }

    oauth2Client.setCredentials(tokens);
    res.send("Authorization complete");

    await knex("settings").where({ id: 0 }).update({ google_refresh_token: tokens.refresh_token });
    console.log("Updated Google refresh token");
});

app.post("/sheets", { schema: { body: zDBSpreadsheets } }, async (req, res) => {
    await knex("spreadsheets").insert(req.body);
    res.send(`Sheet ${req.body.spreadsheet_id} was added.`);

    if (oauth2Client.credentials.refresh_token) {
        const tariffs = await knex<DBBoxTariffs>("box-tariffs").where("date", new Date());
        if (tariffs.length === 0) return;

        await fillSheetWithBoxTariffs(req.body.spreadsheet_id, tariffs);
    }
});

app.listen({ port: env.APP_PORT, host: "0.0.0.0" }, (err) => {
    if (err) {
        console.error("Failed to start http server", err);
        process.exit(1);
    } else {
        console.log("Http server is listening on port " + env.APP_PORT);
    }
});

function formatDate(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

async function runWBJob() {
    console.time("WB API Job");
    try {
        const date = new Date();
        console.log("Starting WB API job at " + date.toString());

        const resp = await fetch("https://common-api.wildberries.ru/api/v1/tariffs/box?date=" + formatDate(date), {
            headers: { Authorization: "Bearer " + env.WB_TOKEN },
        });
        const body = await resp.json().catch(() => {
            throw new Error("Failed to parse WB API response with status " + resp.status);
        });

        if (resp.status != 200) {
            const { data, success, error } = zBoxTariffsError.safeParse(body);
            if (!success) throw new Error(`Failed to parse WB API error: ${error}`);
            throw new Error(`Failed to get WB API data: ${data.title}: ${data.detail}`);
        }

        const { data, success, error } = zBoxTariffsData.safeParse(body);
        if (!success) throw new Error(`Failed to parse WB API data: ${error}`);

        await knex("box-tariffs")
            .insert(data.response.data.warehouseList.map((data) => ({ date, ...data })))
            .onConflict(["date", "warehouseName"])
            .merge();

        if (!oauth2Client.credentials.refresh_token) {
            console.log("Skipping spreadsheets since Google is not authorized.");
        } else {
            const sheetIds = await knex<DBSpreadsheets>("spreadsheets");
            for (const spreadsheetId of sheetIds.map((ent) => ent.spreadsheet_id)) {
                await fillSheetWithBoxTariffs(spreadsheetId, data.response.data.warehouseList);
            }
        }

        console.log("Job finished.");
        console.timeEnd("WB API Job");
    } catch (e) {
        console.error("Failed to run job.", e);
    }
}

const job = CronJob.from({
    cronTime: "0 * * * *",
    onTick: runWBJob,
    start: true,
});
console.log("Started WB API job. Next run at " + job.nextDate().toJSDate().toString());
