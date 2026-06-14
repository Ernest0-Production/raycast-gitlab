import { Form, Icon, popToRoot, Image, ActionPanel, Action, showToast, Toast } from "@raycast/api";
import { Project, Branch, Issue, TemplateDetail } from "../gitlabapi";
import { gitlab } from "../common";
import { useState, useEffect, useRef } from "react";
import { showFailureToast, useCachedPromise, useCachedState, usePromise } from "@raycast/utils";
import { projectIcon, stringToSlug, toFormValues } from "../utils";
import { useProjectMR, useMilestones, ProjectInfoMR } from "../hooks";

interface MRFormValues {
  project_id: number;
  source_branch: string;
  target_branch: string;
  title: string;
  description: string;
  assignee_ids: number[];
  reviewer_ids: number[];
  labels: string[];
  milestone_id: number;
  remove_source_branch: boolean;
}

const NO_TEMPLATE = "no_template";

async function submit(values: MRFormValues) {
  try {
    if (values.title === "") {
      throw Error("Please enter a title");
    }
    if (values.source_branch === "") {
      throw Error("Please select a source branch");
    }
    const formValues = toFormValues(values as unknown as Record<string, unknown>);
    console.log(formValues);
    await showToast({ style: Toast.Style.Animated, title: "Creating Merge Request..." });
    await gitlab.createMR(values.project_id, formValues);
    await showToast(Toast.Style.Success, "Merge Request created", "Merge Request creation successful");
    popToRoot();
  } catch (error) {
    await showFailureToast(error, { title: "Cannot create Merge Request" });
  }
}

export function IssueMRCreateForm({ issue, projectID, title }: { issue: Issue; projectID: number; title: string }) {
  const [targetBranch, setTargetBranch] = useState("");
  const { data } = usePromise(
    async (projectId: number) => {
      const branches = ((await gitlab.fetch(`projects/${projectId}/repository/branches`, {}, true)) as Branch[]) || [];
      const project = await gitlab.getProject(projectId);
      return { branches, project };
    },
    [projectID],
    {
      execute: !!projectID,
    },
  );
  async function submit(values: { source_branch: string; target_branch: string }) {
    const { source_branch, target_branch } = values;
    try {
      await showToast({ style: Toast.Style.Animated, title: "Creating Merge Request..." });
      await gitlab.post(`projects/${projectID}/repository/branches?branch=${source_branch}&ref=${target_branch}`);
      await gitlab.createMR(projectID, {
        id: projectID,
        description: `Closes #${issue.iid}`,
        source_branch: source_branch,
        target_branch: target_branch,
        title: title,
        assignee_id: data?.project?.owner?.id,
      });
      showToast(Toast.Style.Success, "Merge Request created", "Merge Request creation successful");
      popToRoot();
    } catch (error) {
      showFailureToast(error, { title: "Cannot create Merge Request" });
    }
  }

  return (
    <Form
      isLoading={data?.project === undefined && data?.branches === undefined}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Create Merge Request" onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="source_branch"
        title="Source branch"
        placeholder="Enter source branch"
        defaultValue={`${issue.iid}-${stringToSlug(issue.title)}`}
      />
      <TargetBranchDropdown
        project={data?.project}
        info={{ branches: data?.branches || [] }}
        value={targetBranch}
        onChange={setTargetBranch}
      />
    </Form>
  );
}

export function MRCreateForm(props: {
  project?: Project | undefined;
  branch?: string | undefined;
  draftValues?: Form.Values;
}) {
  const [selectedProject, setSelectedProject] = useCachedState("mr-create-project-id", "");
  const { data: projects, isLoading: isLoadingProjects } = useCachedPromise(
    async (): Promise<Project[]> => (await gitlab.getUserProjects({}, true)) || [],
    [],
    { initialData: [] },
  );
  const { projectinfo, isLoadingProjectInfo } = useProjectMR(selectedProject);
  const members = projectinfo?.members || [];

  let project: Project | undefined;
  if (selectedProject) {
    project = projects.find((candidate) => candidate.id.toString() === selectedProject);
  }
  const { milestoneInfo, isLoadingMilestoneInfo } = useMilestones(project?.group_id);

  const isLoading = isLoadingProjects || isLoadingProjectInfo || isLoadingMilestoneInfo;

  const [removeBranch, setRemoveBranch] = useState<boolean | undefined>(() =>
    props.draftValues?.remove_source_branch !== undefined ? Boolean(props.draftValues.remove_source_branch) : undefined,
  );
  const [selectedTemplateName, setSelectedTemplateName] = useState<string>(
    () => (props.draftValues?.template_id as string | undefined) ?? NO_TEMPLATE,
  );
  const [description, setDescription] = useState(() => (props.draftValues?.description as string | undefined) ?? "");
  const [sourceBranch, setSourceBranch] = useState(
    () => (props.draftValues?.source_branch as string | undefined) ?? props.branch ?? "",
  );
  const [targetBranch, setTargetBranch] = useState(
    () => (props.draftValues?.target_branch as string | undefined) ?? props.project?.default_branch ?? "",
  );
  const previousTemplateNameRef = useRef(selectedTemplateName);

  const { data: selectedTemplateDetail } = useCachedPromise(
    async (templateName: string): Promise<TemplateDetail | undefined> => {
      if (templateName === NO_TEMPLATE) return undefined;
      return gitlab.getProjectMergeRequestTemplate(project?.id || 0, templateName);
    },
    [selectedTemplateName],
  );

  useEffect(() => {
    if (props.draftValues?.project_id) {
      setSelectedProject(String(props.draftValues.project_id));
      return;
    }
    if (props.project) {
      setSelectedProject(props.project.id.toString());
    }
  }, [props.draftValues?.project_id, props.project?.id, setSelectedProject]);

  useEffect(() => {
    if (props.branch && !props.draftValues?.source_branch) {
      setSourceBranch(props.branch);
    }
  }, [props.branch, props.draftValues?.source_branch]);

  useEffect(() => {
    if (previousTemplateNameRef.current === selectedTemplateName) {
      return;
    }
    previousTemplateNameRef.current = selectedTemplateName;
    if (selectedTemplateName === NO_TEMPLATE) {
      setDescription("");
      return;
    }
    if (selectedTemplateDetail?.content) {
      setDescription(selectedTemplateDetail.content);
    }
  }, [selectedTemplateName, selectedTemplateDetail]);

  return (
    <Form
      enableDrafts
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Create Merge Request" onSubmit={submit} />
        </ActionPanel>
      }
    >
      <ProjectDropdown
        projects={projects || []}
        setSelectedProject={(newValue) => {
          setRemoveBranch(undefined);
          setSelectedProject(newValue);
          if (!props.branch || props.project?.id.toString() !== newValue) {
            setSourceBranch("");
          }
          const nextProject = projects.find((candidate) => candidate.id.toString() === newValue);
          if (nextProject?.default_branch) {
            setTargetBranch(nextProject.default_branch);
          }
        }}
        value={selectedProject}
      />
      <SourceBranchDropdown project={project} info={projectinfo} value={sourceBranch} onChange={setSourceBranch} />
      <TargetBranchDropdown project={project} info={projectinfo} value={targetBranch} onChange={setTargetBranch} />
      <Form.Separator />
      <Form.TextField
        id="title"
        title="Title"
        placeholder="Enter title"
        defaultValue={props.draftValues?.title as string | undefined}
        autoFocus={selectedProject !== ""}
      />
      <Form.Dropdown id="template_id" title="Template" value={selectedTemplateName} onChange={setSelectedTemplateName}>
        <Form.Dropdown.Item key={NO_TEMPLATE} value={NO_TEMPLATE} title={"None"} />
        {(projectinfo?.mergeRequestTemplates || []).map((template) => (
          <Form.Dropdown.Item key={template.id} value={template.id} title={template.name} />
        ))}
      </Form.Dropdown>
      <Form.TextArea
        id="description"
        title="Description"
        placeholder="Enter description"
        enableMarkdown
        value={description}
        onChange={setDescription}
      />
      <Form.TagPicker
        id="assignee_ids"
        title="Assignees"
        placeholder="Type or choose an assignee"
        defaultValue={props.draftValues?.assignee_ids as string[] | undefined}
      >
        {members.map((member) => (
          <Form.TagPicker.Item
            key={member.id.toString()}
            value={member.id.toString()}
            title={member.name || member.username}
            icon={{ source: member.avatar_url, mask: Image.Mask.Circle }}
          />
        ))}
      </Form.TagPicker>
      <Form.TagPicker
        id="reviewer_ids"
        title="Reviewers"
        placeholder="Type or choose a reviewer"
        defaultValue={props.draftValues?.reviewer_ids as string[] | undefined}
      >
        {members.map((member) => (
          <Form.TagPicker.Item
            key={member.id.toString()}
            value={member.id.toString()}
            title={member.name || member.username}
            icon={{ source: member.avatar_url }}
          />
        ))}
      </Form.TagPicker>
      <Form.TagPicker
        id="labels"
        title="Labels"
        placeholder="Type or choose an label"
        defaultValue={props.draftValues?.labels as string[] | undefined}
      >
        {(projectinfo?.labels || []).map((label) => (
          <Form.TagPicker.Item
            key={label.name}
            value={label.name}
            title={label.name}
            icon={{ source: Icon.Circle, tintColor: label.color }}
          />
        ))}
      </Form.TagPicker>
      <Form.Dropdown
        id="milestone_id"
        title="Milestone"
        defaultValue={props.draftValues?.milestone_id as string | undefined}
      >
        <Form.Dropdown.Item key={"no_milestone"} value={""} title={"-"} />
        {projectinfo?.milestones?.map((milestone) => (
          <Form.Dropdown.Item key={milestone.id} value={milestone.id.toString()} title={milestone.title} />
        ))}
        {milestoneInfo?.map((milestone) => (
          <Form.Dropdown.Item key={milestone.id} value={milestone.id.toString()} title={milestone.title} />
        ))}
      </Form.Dropdown>
      <Form.Checkbox
        id="remove_source_branch"
        label="Delete source branch when merge request is accepted"
        value={removeBranch !== undefined ? removeBranch : (project?.remove_source_branch_after_merge ?? true)}
        onChange={setRemoveBranch}
      />
    </Form>
  );
}

function ProjectDropdown(props: {
  projects: Project[];
  setSelectedProject: (value: string | ((previous: string) => string)) => void;
  value: string;
}) {
  return (
    <Form.Dropdown
      id="project_id"
      title="Project"
      value={props.value}
      onChange={(newValue: string) => {
        props.setSelectedProject(newValue);
      }}
    >
      {props.projects.map((project) => (
        <ProjectDropdownItem key={project.id} project={project} />
      ))}
    </Form.Dropdown>
  );
}

function branchesByCommittedDate(branches: Branch[]): Branch[] {
  return [...branches].sort(
    (left, right) => Date.parse(right.commit?.committed_date ?? "") - Date.parse(left.commit?.committed_date ?? ""),
  );
}

function SourceBranchDropdown(props: {
  project?: Project | undefined;
  info?: ProjectInfoMR | undefined;
  value: string;
  onChange: (value: string) => void;
}) {
  if (props.project && props.info) {
    const branches = branchesByCommittedDate(props.info.branches).filter(
      (branch) => branch.name !== props.project?.default_branch,
    );
    const branchNames = new Set(branches.map((branch) => branch.name));
    if (props.value) {
      branchNames.add(props.value);
    }
    const sourceBranches = [...branchNames].sort((left, right) => {
      if (left === props.value) {
        return -1;
      }
      if (right === props.value) {
        return 1;
      }
      return left.localeCompare(right);
    });
    return (
      <Form.Dropdown
        id="source_branch"
        title="Source Branch"
        value={props.value && sourceBranches.includes(props.value) ? props.value : sourceBranches[0] ?? ""}
        onChange={props.onChange}
      >
        {sourceBranches.map((name) => (
          <Form.Dropdown.Item key={name} value={name} title={name} />
        ))}
      </Form.Dropdown>
    );
  }
  return (
    <Form.Dropdown
      id="source_branch"
      title="Source Branch"
      value={props.value}
      onChange={props.onChange}
    >
      {props.value ? (
        <Form.Dropdown.Item key={props.value} value={props.value} title={props.value} />
      ) : (
        <Form.Dropdown.Item key="_empty" value="" title="-" />
      )}
    </Form.Dropdown>
  );
}

function TargetBranchDropdown(props: {
  project?: Project | undefined;
  info?: Pick<ProjectInfoMR, "branches"> | undefined;
  value: string;
  onChange: (value: string) => void;
}) {
  if (props.project && props.info) {
    const branches = branchesByCommittedDate(props.info.branches);
    const branchNames = new Set(branches.map((branch) => branch.name));
    if (props.value) {
      branchNames.add(props.value);
    }
    const targetBranches = [...branchNames].sort((left, right) => {
      if (left === props.project?.default_branch) {
        return -1;
      }
      if (right === props.project?.default_branch) {
        return 1;
      }
      return left.localeCompare(right);
    });
    return (
      <Form.Dropdown
        id="target_branch"
        title="Target branch"
        value={props.value && targetBranches.includes(props.value) ? props.value : (targetBranches[0] ?? "")}
        onChange={props.onChange}
      >
        {targetBranches.map((name) => (
          <Form.Dropdown.Item key={name} value={name} title={name} />
        ))}
      </Form.Dropdown>
    );
  }
  return (
    <Form.Dropdown id="target_branch" title="Target branch" value={props.value} onChange={props.onChange}>
      {props.value ? (
        <Form.Dropdown.Item key={props.value} value={props.value} title={props.value} />
      ) : (
        <Form.Dropdown.Item key="_empty" value="" title="-" />
      )}
    </Form.Dropdown>
  );
}

function ProjectDropdownItem(props: { project: Project }) {
  return (
    <Form.Dropdown.Item
      value={props.project.id.toString()}
      title={props.project.name_with_namespace}
      icon={projectIcon(props.project)}
    />
  );
}
