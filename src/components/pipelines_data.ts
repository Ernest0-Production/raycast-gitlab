import { List } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useRef } from "react";
import { Pipeline } from "../gitlabapi";
import { getErrorMessage } from "../utils";
import { fetchMRPipelinesGqlPage, fetchProjectPipelinesGqlPage } from "./pipelines_gql";

export type ListPagination = List.Props["pagination"];

export function usePaginatedProjectPipelines(options: {
  cacheKey: string;
  projectFullPath: string;
  execute?: boolean;
  keepPreviousData?: boolean;
}): {
  pipelines: Pipeline[] | undefined;
  isLoading: boolean;
  error: string | undefined;
  performRefetch: () => void;
  pagination: ListPagination;
} {
  const projectFullPathRef = useRef(options.projectFullPath);
  projectFullPathRef.current = options.projectFullPath;

  const { data, isLoading, error, revalidate, pagination } = useCachedPromise(
    (cacheKey: string) => async (paginationOptions: { page: number }) => {
      const { pipelines, hasMore } = await fetchProjectPipelinesGqlPage({
        cacheKey,
        page: paginationOptions.page,
        projectFullPath: projectFullPathRef.current,
      });
      return { data: pipelines, hasMore };
    },
    [options.cacheKey],
    { execute: options.execute, keepPreviousData: options.keepPreviousData },
  );

  return {
    pipelines: data,
    isLoading,
    error: error ? getErrorMessage(error) : undefined,
    performRefetch: revalidate,
    pagination,
  };
}

export function usePaginatedMRPipelines(options: {
  cacheKey: string;
  projectFullPath: string;
  mrIID: number;
  execute?: boolean;
  keepPreviousData?: boolean;
}): {
  pipelines: Pipeline[] | undefined;
  isLoading: boolean;
  error: string | undefined;
  performRefetch: () => void;
  pagination: ListPagination;
} {
  const projectFullPathRef = useRef(options.projectFullPath);
  projectFullPathRef.current = options.projectFullPath;
  const mrIIDRef = useRef(options.mrIID);
  mrIIDRef.current = options.mrIID;

  const { data, isLoading, error, revalidate, pagination } = useCachedPromise(
    (cacheKey: string) => async (paginationOptions: { page: number }) => {
      const { pipelines, hasMore } = await fetchMRPipelinesGqlPage({
        cacheKey,
        page: paginationOptions.page,
        projectFullPath: projectFullPathRef.current,
        mrIID: mrIIDRef.current,
      });
      return { data: pipelines, hasMore };
    },
    [options.cacheKey],
    { execute: options.execute, keepPreviousData: options.keepPreviousData },
  );

  return {
    pipelines: data,
    isLoading,
    error: error ? getErrorMessage(error) : undefined,
    performRefetch: revalidate,
    pagination,
  };
}
