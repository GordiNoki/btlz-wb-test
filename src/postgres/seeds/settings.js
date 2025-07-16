/**
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export async function seed(knex) {
    await knex("settings")
        .insert([{ id: 0 }])
        .onConflict()
        .ignore();
}
