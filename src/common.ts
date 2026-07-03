import { ApolloClient, ApolloLink, HttpLink, InMemoryCache, NormalizedCacheObject } from "@apollo/client";
import { onError } from "@apollo/client/link/error";
import fetch from "node-fetch";

import os from "os";
import path from "path";
import { getHttpAgent, GitLab } from "./gitlabapi";
import { getPreferences, parseCommaSeparatedPreference } from "./utils";

let gitlabClient: GitLab | undefined;

function createGitLabClient(): GitLab {
  const preferences = getPreferences();
  const instance = preferences.instance || "https://gitlab.com";
  return new GitLab(instance, preferences.token);
}

function getGitLabClient(): GitLab {
  if (!gitlabClient) {
    gitlabClient = createGitLabClient();
  }
  return gitlabClient;
}

class GitLabGQL {
  public url: string;
  public client: ApolloClient<NormalizedCacheObject>;
  constructor(url: string, client: ApolloClient<NormalizedCacheObject>) {
    this.url = url;
    this.client = client;
  }
  public urlJoin(url: string): string {
    return `${this.url}/${url}`;
  }
}

function createGitLabGQLClient(): GitLabGQL {
  const preferences = getPreferences();
  const instance = preferences.instance || "https://gitlab.com";
  const token = preferences.token;
  const graphqlEndpoint = `${instance}/api/graphql`;
  const httpLink = new HttpLink({
    uri: graphqlEndpoint,
    fetch: fetch as unknown as typeof globalThis.fetch,
    fetchOptions: { agent: getHttpAgent() },
  });

  const authMiddleware = new ApolloLink((operation, forward) => {
    operation.setContext(({ headers = {} }) => ({
      headers: {
        ...headers,
        authorization: token ? `Bearer ${token}` : "",
      },
    }));
    return forward(operation);
  });

  const errorLink = onError(({ graphQLErrors, networkError }) => {
    if (graphQLErrors) {
      for (const error of graphQLErrors) {
        console.warn(`GitLab GraphQL: ${error.message}`);
      }
    }
    if (networkError) {
      const statusCode = "statusCode" in networkError ? networkError.statusCode : undefined;
      console.warn(`GitLab GraphQL network error${statusCode ? ` ${statusCode}` : ""}: ${networkError.message}`);
    }
  });

  const client = new ApolloClient({
    link: ApolloLink.from([authMiddleware, errorLink, httpLink]),
    cache: new InMemoryCache(),
    defaultOptions: {
      query: {
        // Raycast hooks own caching; Apollo normalized cache merge fails when list
        // filter variables change (e.g. project.mergeRequests with different state).
        fetchPolicy: "no-cache",
      },
    },
  });
  return new GitLabGQL(instance, client);
}

export const gitlab: GitLab = new Proxy({} as GitLab, {
  get(_target, prop) {
    const client = getGitLabClient();
    const value = Reflect.get(client, prop, client) as unknown;
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(client);
    }
    return value;
  },
});

let gitlabgql: GitLabGQL | undefined;

export function getGitLabGQL(): GitLabGQL {
  if (!gitlabgql) {
    gitlabgql = createGitLabGQLClient();
  }
  return gitlabgql;
}

export enum PrimaryAction {
  Detail = "detail",
  Browser = "browser",
}

export function getPrimaryActionPreference(): PrimaryAction {
  const { primaryaction } = getPreferences();
  if (primaryaction === PrimaryAction.Detail) {
    return PrimaryAction.Detail;
  }
  return PrimaryAction.Browser;
}

export function getPreferPopToRootPreference(): boolean {
  return getPreferences().poptoroot;
}

export function getExcludeTodoAuthorUsernamesPreference(): string[] {
  return parseCommaSeparatedPreference(getPreferences().excludeTodoAuthorUsernames);
}

export function getArtifactDownloadDirectoryPreference(): string {
  const directory = (getPreferences().artifactDownloadDirectory ?? "").trim();
  if (!directory) {
    return path.join(os.homedir(), "Downloads");
  }
  if (directory.startsWith("~/")) {
    return path.join(os.homedir(), directory.slice(2));
  }
  return directory;
}
