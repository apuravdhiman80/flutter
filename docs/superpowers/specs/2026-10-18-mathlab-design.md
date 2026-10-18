# MathLab Design

**Status:** Awaiting written-spec review
**Product:** A standalone, local-first interactive mathematics and science web app
**First release:** Math & Graphs, Signals, Neural Networks, and an optional AI tutor

## Purpose and audience

MathLab is for a broad audience that wants to explore mathematical and scientific ideas interactively. New users should be able to start with guided examples; experienced learners should be able to expose more controls and inspect the computations behind a result.

The product combines interactive graphing, numerical mathematics, signal analysis, and small neural-network experiments in one workspace. Familiar graphing interactions may inform the experience, while MathLab uses its own visual identity and focused feature set.

## Product boundaries

- Create a standalone Next.js and TypeScript app from scratch under `mathlab/`, with its own package manifest, dependencies, and run instructions. The current checkout has no app source or package manifest; Node.js is available and the Flutter CLI is not.
- Make the first release a responsive browser app for desktop, tablet, and phone layouts. It does not require a native mobile build.
- Do not couple MathLab to Sightline's UI, object-detection API, training data, launcher, or runtime.
- Perform graph, signal, and neural-network calculations locally in the browser.
- Use an online model provider only when the user configures the AI tutor and explicitly sends a prompt.
- Keep projects and settings on the user's device. Do not add accounts, cloud project storage, or cross-device sync in the first release.

## First-release workspaces

### Math & Graphs

The workspace provides a list of plotted expressions and a graph canvas. Users can enter multiple single-variable expressions, adjust named parameters with sliders, pan and zoom, and trace a point on a curve. Parameter sliders have editable ranges and steps. A table shows values over a chosen interval. The analysis panel reports supported numerical roots, curve intersections, local slopes, and areas over a selected interval. Undefined samples break the plotted curve so the renderer does not draw across a discontinuity.

The first-release evaluator supports the operators `+`, `-`, `*`, `/`, and `^`; parentheses; the variable `x`; named numeric parameters; constants `pi` and `e`; and the functions `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `sqrt`, `abs`, `exp`, `ln`, and `log10`. Multiplication is explicit. Expressions are parsed into a restricted representation and evaluated by the math engine; user text is never executed as JavaScript. Unsupported syntax and domain errors are shown beside the affected expression. Numerical procedures expose their limits and do not imply exact symbolic solutions.

Root and intersection results are limited to the visible x-range and report when a result may have been missed because of sampling or convergence limits. Slopes and areas are numerical estimates. The first release does not claim general symbolic algebra or exact solutions.

The explanation panel describes the supported operation and the computed values used. Its claims are based on the active expression and visible graph analysis.

### Signals

The signal builder combines sine, square, and triangle waves. Each source has amplitude, frequency, and phase controls. Users can set sampling rate and duration, add optional noise, and select a rectangular or Hann window.

The workspace plots the sampled signal in the time domain and its FFT magnitude spectrum in the frequency domain. It displays sampling frequency, frequency-bin spacing, and the Nyquist limit. Changing sampling rate or windowing updates both plots so users can explore aliasing and spectral leakage. Controls report invalid or undersampled configurations without discarding the signal setup.

### Neural Networks

The lab trains a small, fully connected network on built-in two-dimensional classification datasets: XOR, concentric circles, and two Gaussian clusters. Users select a dataset and configure one to three hidden layers, up to 32 units per hidden layer, ReLU, tanh, or sigmoid hidden activations, learning rate, and up to 2,000 training steps. Training can be started, paused, reset, and observed as it runs. A fixed or randomized seed makes a run reproducible when the user chooses it.

The display includes the dataset, learned decision boundary, loss and accuracy curves, and a way to inspect activations by layer for a selected point. Training is limited to small browser-friendly models and datasets. The interface presents metrics as outcomes of the current run, not guarantees of model quality.

### AI tutor

The tutor is optional. It supports configurable OpenAI-compatible chat endpoints through provider URL, model name, and API key settings. A local Next.js server route forwards a user-submitted prompt and its selected context to the configured provider. The computation engines remain the source of graph, FFT, and training results; the tutor explains or discusses those results but does not replace them.

The user reviews and sends each prompt explicitly. Context can include the active expression or selected signal/network settings and computed summaries. The app does not automatically send full datasets, network weights, project contents, or background activity. The API key is held in browser memory for the active session, is sent only to the local server route, is not logged or persisted, and must be re-entered after reload. The route accepts HTTPS provider URLs and rejects local or private-network destinations. Tutor conversation history stays in tab memory and is excluded from saved projects and project exports. Provider errors preserve the active lab state and offer retry.

## Shared experience and saved work

The landing view presents three direct lab entry points and recent local projects. Within a lab, controls, plots, summaries, and explanations share a consistent layout. The AI tutor opens as a context panel that can be hidden without changing lab state.

Users can save projects in IndexedDB, export a project file, and import a previously exported project. A project contains the active lab, input parameters, expressions or signal/network configuration, and reproducible result settings needed to recompute views. It excludes API keys and tutor conversations. Import validates the version and data shape and reports unsupported or invalid fields without replacing the current project.

Local computation should keep the interface responsive. Expensive sampling, FFT, or training work can run in a web worker. Progress, cancellation, and errors return to the active lab without losing the user's configuration.

## Architecture and data flow

```text
Browser UI
  Math & Graphs | Signals | Neural Networks | AI tutor panel
       |                 |              |            |
       v                 v              v            v
  Math engine       Signal engine   ML engine   Local Next.js route
  parse/evaluate    sample/FFT      train/inspect      |
       |                 |              |             v
       +------ local computed state -----+      Configured provider
                         |
                         v
             Browser project storage/export
```

The new app has distinct UI, computation, and persistence modules. Each lab owns its input model, computation API, and result data. Shared shell components handle navigation and workspace layout. Project storage serializes versioned configuration, while each engine recomputes its results from that configuration. The AI route is isolated from lab computation and has no authority to write lab state.

The initial implementation creates a separate Next.js package under `mathlab/`. It does not depend on or restore the former Sightline app or API. Library choices for graph rendering, expression parsing, FFT, and small-network training are made during implementation after checking compatibility with the installed toolchain and the required interaction behavior.

## Error handling and privacy

- Parse and domain failures are attached to the expression or control that caused them; valid expressions and other labs remain usable.
- Numerical warnings identify failed convergence, sampling limits, or insufficient data and preserve the user's current settings.
- Training errors stop the current run, preserve its configuration and visible progress, and offer a retry or reset path.
- AI connection, authentication, rate-limit, and provider errors are reported in the tutor panel. They do not invalidate computed results.
- Local work remains in browser storage unless the user exports it. Provider context leaves the device only after the user submits a tutor prompt.
- No telemetry, login, remote project storage, or background provider calls are part of the first release.

## Delivery stages

1. **App shell and Math & Graphs:** create the standalone app, workspace layout, safe expression evaluation, 2D plotting, parameter sliders, tracing, tables, and numerical analysis.
2. **Signals:** add waveform composition, sampling, noise, window controls, time plots, FFT spectrum, and sampling explanations.
3. **Neural Networks:** add built-in datasets, bounded network configuration, browser training, decision boundaries, metrics, and activation inspection.
4. **Persistence and AI tutor:** add versioned local projects, import/export, provider configuration, context selection, and the local forwarding route.
5. **Polish:** refine responsive behavior, keyboard use, accessible chart controls, empty/error/loading states, and consistent visual design across labs.

These stages build toward one first release containing all three labs and the optional tutor.

## First-release acceptance criteria

1. MathLab starts independently and does not require or restore Sightline's object-detection app or API.
2. A user can plot and compare multiple supported expressions, adjust parameters, trace values, view a table, and inspect numerical analysis with clear limits and errors.
3. A user can compose a signal, change sampling and window settings, and observe corresponding time- and frequency-domain plots with Nyquist information.
4. A user can train a bounded dense network on a built-in 2D dataset and inspect its decision boundary, training metrics, and activations.
5. A user can save and restore local project configuration or export/import it without including API keys or tutor history.
6. When configured, the tutor uses an OpenAI-compatible provider only after an explicit user submission, with selected context and no persisted key.
7. Invalid input or a failed local/provider operation leaves unrelated lab state intact and provides a clear recovery path.
8. Existing Sightline files and in-progress changes remain untouched by MathLab's app implementation.

## Open implementation choices

The design intentionally leaves the plotting, expression parser, FFT, and neural-network libraries undecided. Implementation will compare suitable maintained options against current Next.js compatibility, numeric behavior, bundle size, performance, and accessibility before selecting dependencies.
