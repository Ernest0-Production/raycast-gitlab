import { User } from "../../gitlabapi";

export interface CommitStatus {
  status: string;
  author: User;
  ref?: string;
  allow_failure: boolean;
}

export interface Commit {
  id: string;
  short_id: string;
  title: string;
  created_at: string;
  message: string;
  committer_name: string;
  author_name: string;
  author_email?: string;
  committed_date: string;
  web_url: string;
  author_avatar_url?: string;
  pipeline_status?: string;
}
