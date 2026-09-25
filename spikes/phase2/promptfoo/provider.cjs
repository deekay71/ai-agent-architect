// Local deterministic provider. It never calls a model and cannot see oracle labels.
module.exports = class FixtureProvider {
  id() { return 'phase2-local-fixture'; }
  async callApi(_prompt, context) {
    return { output: JSON.stringify(context.vars.candidate), tokenUsage: { total: 0, prompt: 0, completion: 0 }, cost: 0 };
  }
};
