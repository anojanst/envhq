import createClient, { type Client, type ClientOptions } from "openapi-fetch";
import type { paths } from "./types";

export function createApiClient(options?: ClientOptions): Client<paths> {
  return createClient<paths>(options);
}

export type { Client, ClientOptions } from "openapi-fetch";
