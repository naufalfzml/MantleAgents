## ADDED Requirements

### Requirement: /orchestration page includes a chat-style prompt input
The `/orchestration` page SHALL be extended to include a text input area where the user can type a natural-language strategy prompt and submit it for workflow generation. The input MUST be accessible alongside the existing n8n canvas embed from Change 04.

#### Scenario: User can type and submit a prompt
- **WHEN** a logged-in user navigates to `/orchestration`
- **THEN** they MUST see a text area or chat input and a "Generate Workflow" submit button

#### Scenario: Submitting prompt calls POST /workflow/generate
- **WHEN** the user clicks "Generate Workflow"
- **THEN** the frontend MUST call `POST /workflow/generate` with the prompt and the authenticated wallet address

### Requirement: Preview panel displays workflow diagram and text summary before deploy
After a successful generation response, the `/orchestration` page SHALL display: (1) a text summary of the generated workflow, (2) a visual representation of the node chain (can be a simple ordered list of node names for MVP), and (3) any validation issues when `validation.passed === false`.

#### Scenario: Valid generation shows summary and node list
- **WHEN** the API returns `{ workflowJson, summary, validation: { passed: true } }`
- **THEN** the UI MUST display `summary` and an ordered list of node names from `workflowJson.nodes`

#### Scenario: Failed validation shows issue list
- **WHEN** the API returns `validation.passed === false`
- **THEN** the UI MUST display each string from `validation.issues` as a visible error message

### Requirement: Deploy to Canvas button disabled when validation fails
The "Deploy to Canvas" button SHALL be rendered as disabled (and visually distinct) when `validation.passed === false`. Clicking a disabled button MUST NOT trigger any action.

#### Scenario: Button disabled on validation failure
- **WHEN** the generated workflow has `validation.passed === false`
- **THEN** the "Deploy to Canvas" button MUST be disabled and MUST NOT call the n8n import API on click

#### Scenario: Button enabled on validation success
- **WHEN** the generated workflow has `validation.passed === true`
- **THEN** the "Deploy to Canvas" button MUST be enabled and clickable

### Requirement: Deploy to Canvas imports the workflow into the user's n8n instance
When the user clicks "Deploy to Canvas" and validation has passed, the frontend SHALL call the provisioning/import endpoint from Change 04 with the generated `workflowJson`, replacing or adding the workflow to the user's n8n canvas. On success, the n8n iframe MUST reload to display the newly deployed workflow.

#### Scenario: Successful deploy reloads canvas with new workflow
- **WHEN** the user clicks "Deploy to Canvas" on a validated workflow
- **THEN** the n8n iframe in the canvas section MUST reload and display the newly imported workflow nodes

#### Scenario: Deploy failure shows error message
- **WHEN** the n8n import API call returns an error
- **THEN** the UI MUST display an error message and MUST NOT silently fail

### Requirement: UI shows loading state during generation
While waiting for `POST /workflow/generate` to return, the UI SHALL display a loading indicator on the "Generate Workflow" button or in the preview area. The prompt input MUST be disabled during the loading state to prevent double-submission.

#### Scenario: Loading state during generation
- **WHEN** the "Generate Workflow" button is clicked and the request is in-flight
- **THEN** the button or an adjacent indicator MUST show a loading state and the input MUST be disabled
