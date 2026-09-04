/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as discovery from "../discovery.js";
import type * as drafting from "../drafting.js";
import type * as email from "../email.js";
import type * as http from "../http.js";
import type * as pursuits from "../pursuits.js";
import type * as rateLimits from "../rateLimits.js";
import type * as sampleSource from "../sampleSource.js";
import type * as seed from "../seed.js";
import type * as session from "../session.js";
import type * as workspace from "../workspace.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  discovery: typeof discovery;
  drafting: typeof drafting;
  email: typeof email;
  http: typeof http;
  pursuits: typeof pursuits;
  rateLimits: typeof rateLimits;
  sampleSource: typeof sampleSource;
  seed: typeof seed;
  session: typeof session;
  workspace: typeof workspace;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  agentmail: import("@agentmail/convex/_generated/component.js").ComponentApi<"agentmail">;
  firecrawl: import("@firecrawl/firecrawl-convex/_generated/component.js").ComponentApi<"firecrawl">;
};
