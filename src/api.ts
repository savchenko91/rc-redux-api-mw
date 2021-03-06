/* eslint-disable import/no-cycle */
import { Middleware, Dispatch, MiddlewareAPI } from 'redux'

import { REDUX_API_MIDDLEWARE } from './constant'
import { buildRequest, onStage, getResponseBody } from './helper'
import { APIAction, Config, StageAction, StartActionParams, StageFunctionName, EndAction } from './type'

class APIReduxMiddleware {
  config: Config | null

  constructor(config?: Config) {
    this.config = config || null
  }

  public middleware = (): Middleware<Dispatch<APIAction<unknown, unknown, unknown, 'endAction'>>> => {
    return (api) => (next) => async (action): Promise<APIAction | StageAction | EndAction> => {
      if (action.type !== REDUX_API_MIDDLEWARE) {
        return next(action)
      }

      const endAction = await this.request(action, api)

      if (action.dispatchReturns === 'endAction') {
        return endAction
      } else {
        return action
      }
    }
  }

  private async request(action: APIAction, store: MiddlewareAPI): Promise<EndAction> {
    const abortController = new AbortController()

    const startActionParams = { action, abortController, store, config: this.config }

    try {
      const fetchPromise = this.fetch(startActionParams)

      onStage(StageFunctionName.onStart, startActionParams)

      const [request, response] = await fetchPromise

      const body = await getResponseBody(action, response)

      const endActionParams = { body, request, response, ...startActionParams }

      return onStage(response.ok ? StageFunctionName.onSuccess : StageFunctionName.onFail, endActionParams)
    } catch (error) {
      const failActionParams = { error, ...startActionParams }

      return onStage(StageFunctionName.onFail, failActionParams)
    }
  }

  private async fetch(params: StartActionParams): Promise<[Request, Response]> {
    const request = buildRequest(params)

    let response = await fetch(request.clone())

    if (!response.ok && this.config?.beforeFail) {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const retryRequest = await this.config.beforeFail({ request, response, ...params })

        if (!retryRequest) break
        // eslint-disable-next-line no-await-in-loop
        response = await fetch(retryRequest)
      }
    }

    return [request, response]
  }
}

export default APIReduxMiddleware
