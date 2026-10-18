# Reference Image Match Workspace — Design

**Status:** Draft for user review (2026-10-18).

## Goal

Add a local image-matching workspace to Sightline. A user chooses one reference photo, adds candidate photos, and gets the candidates ranked by visual similarity to the reference. The feature uses a pretrained image encoder and nearest-neighbor scoring; users do not need to create classes, draw boxes, or train a model.

## Existing project context

Sightline is a Windows-first Next.js app backed by a local FastAPI service. The current working tree already contains uncommitted changes for a dark detector interface, a local YOLO detector, and a custom-training page. This change adds a `/match` workspace and a navigation link while preserving the existing detector at `/` and training page at `/training`.

## User experience

- A dark, responsive Match page uses the existing Sightline visual system and makes the local-only processing state visible.
- The user selects one reference image and one or more candidate images. JPEG, PNG, and WebP are supported; each image may be up to 10 MB, no more than 20 candidates may be compared in one run, and all selected image files together may total up to 100 MB.
- The reference and candidate previews appear before matching. Users can remove or replace either the reference or individual candidates. Starting a new match clears stale results.
- Results are ordered from most to least similar. The best candidate is featured first, followed by the remaining ranked candidates, with filename and a visual similarity score for each.
- Scores represent cosine similarity between image embeddings. They are ranking signals, not probabilities or calibrated confidence values. The interface labels them as similarity and does not call them confidence.
- Loading, local-model download/load, API offline, invalid image, file/count/total-size limit, empty candidate list, and inference error states are clear and recoverable. Request failures can be retried in the UI; a model-load failure explains how to restart the local service and retry.
- Image previews use browser object URLs and are released when files are removed or the page unmounts.

## Matching model and behavior

- Use the pretrained OpenAI CLIP ResNet-50 image encoder through the maintained `open_clip_torch` package. Its visual tower is a CNN, and its pretrained representation is intended to compare image content semantically.
- Load the encoder once in the local Python service, in the background so API health remains responsive. Select CUDA when available and CPU otherwise. Run inference without gradients and serialize access to the shared model.
- On a match request, decode and orient the reference and each candidate in memory, apply the encoder's canonical image preprocessing, produce L2-normalized image embeddings, and calculate cosine similarity between the reference embedding and each candidate embedding.
- Sort candidates by descending raw cosine similarity. Preserve original upload order for exact ties. Return each candidate's client identifier, filename, raw similarity score, and rank so the browser can associate scores with previews.
- The feature performs whole-image matching. It does not locate or box objects inside candidate images. It does not fine-tune the encoder or persist source photos or embeddings.
- If the pretrained weights are not already cached, they are downloaded and cached locally on first model load. Internet access is needed only to fetch missing weights; after caching, image requests are processed by the local service and are not uploaded to a remote model service. A missing or failed model download is reported in the Match workspace and can be retried by restarting the local service.

## Architecture and data flow

- Add a dedicated `web/app/match/page.tsx` route and a focused client component for image selection, previews, request lifecycle, and ranked results. Add a Match link to the existing app navigation.
- Add a Python matcher module that owns model initialization, preprocessing, embedding extraction, and cosine ranking. Keep it separate from the existing YOLO detector so the two model lifecycles and result types remain clear.
- Add `POST /api/match`, accepting multipart form data with one `reference` image, repeated `candidates` images, and corresponding repeated `candidate_ids` in upload order. Validate content type, image decoding, dimensions, candidate count, per-image byte limit, and total image bytes before inference. Return image dimensions and the ranked candidates with raw similarity scores.
- Extend local API health information with the match-model readiness, model name, and useful startup/load error details without changing the meaning of the existing detector readiness fields.
- Browser previews remain in memory. The API decodes request bytes in memory and does not write the reference or candidate images to the training-data directory or any other persistent location. Only pretrained model weights may be cached on disk.
- Update the README with the Match workflow, accepted limits, ranking-score meaning, local privacy behavior, and first-run model download requirement.

## Error handling and privacy

- Reject unsupported MIME types, corrupt image bytes, images over 10 MB, images over 50 megapixels, batches over 20 candidates, and total selected image bytes over 100 MB with actionable messages.
- Keep the API available while the encoder loads or downloads; report `loading`, `ready`, or `error` for the matching model separately from YOLO health.
- If the encoder is unavailable, return a service-unavailable response with a short diagnostic message. If one candidate is invalid, fail the request with the affected filename and do not show partial or stale rankings.
- Do not save uploaded images, crops, or image embeddings. Do not send user images to an external API. The model-weight download is the only network dependency for matching setup.

## Acceptance criteria

1. The Match route is reachable from the existing dark Sightline navigation and adapts to narrow screens.
2. A user can choose one valid reference photo and multiple valid candidates, preview and remove them, and start a match request.
3. The local pretrained encoder returns all candidates sorted by descending cosine similarity; an exact duplicate of the reference receives the highest score (ties allowed), with deterministic upload-order tie handling.
4. The result UI highlights the best match, shows every candidate's rank, filename, and similarity score, and explains that the score is not a probability.
5. Unsupported, corrupt, oversized, too-many, and aggregate-too-large input are rejected with readable errors; no partial results replace a prior image selection.
6. API-offline, model-loading, model-error, empty-input, request-error, and success states are visible and recoverable.
7. Source images and embeddings are not persisted or sent to a remote inference service. Model weights may be cached locally after initial download.
8. The existing `/` detector and `/training` workflow remain reachable and keep their current behavior.
9. The frontend production build and focused API verification complete successfully.

## Out of scope

- Finding or drawing object boxes inside the reference or candidate photos.
- Natural-language object prompts, OCR, captions, or scene descriptions in the Match flow.
- Webcam/video matching, saved galleries, accounts, remote inference, custom class training, and model fine-tuning.

## Technical references

- [OpenAI CLIP reference implementation](https://github.com/openai/CLIP)
- [OpenCLIP implementation and pretrained model usage](https://github.com/mlfoundations/open_clip)
