// Releases go out from GitHub Actions with provenance; a local `npm publish` stops here.
// The very first version has to be published by hand, with RELEASE_MODE=true set.
if (!process.env.GITHUB_ACTIONS && !process.env.RELEASE_MODE) {
	console.error('Publish by pushing a version tag (e.g. 0.2.0); GitHub Actions publishes it to npm.')
	process.exit(1)
}