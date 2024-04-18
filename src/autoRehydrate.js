import { REHYDRATE } from './constants'
import isStatePlainEnough from './utils/isStatePlainEnough'

export default function autoRehydrate (config = {}) {
  console.log("redux-persist: autoRehydrate()");
  const stateReconciler = config.stateReconciler || defaultStateReconciler

  return (next) => (reducer, initialState, enhancer) => {
    let store = next(liftReducer(reducer), initialState, enhancer)
    return {
      ...store,
      replaceReducer: (reducer) => {
        return store.replaceReducer(liftReducer(reducer))
      }
    }
  }

  function liftReducer (reducer) {
    let rehydrated = false
    let preRehydrateActions = []
    console.log(`redux-persist: autoRehydrate.liftReducer() rehydrated=${rehydrated}, preRehydrateActions=${preRehydrateActions}`)

    return (state, action) => {
      console.log(`redux-persist: autoRehydrate.liftReducer.tick action=${action}`)
      if (action.type !== REHYDRATE) {
        if (config.log && !rehydrated) preRehydrateActions.push(action) // store pre-rehydrate actions for debugging
        return reducer(state, action)
      } else {
        if (config.log && !rehydrated) logPreRehydrate(preRehydrateActions)
        rehydrated = true

        let inboundState = action.payload
        let reducedState = reducer(state, action)

        return stateReconciler(state, inboundState, reducedState, config.log)
      }
    }
  }
}

function logPreRehydrate (preRehydrateActions) {
  const concernedActions = preRehydrateActions.slice(1)
  if (concernedActions.length > 0) {
    console.log(`
      redux-persist-legacy/autoRehydrate: %d actions were fired before rehydration completed. This can be a symptom of a race
      condition where the rehydrate action may overwrite the previously affected state. Consider running these actions
      after rehydration:
    `, concernedActions.length, concernedActions)
  }
}

function defaultStateReconciler (state, inboundState, reducedState, log) {
  console.log("redux-persist: autoRehydrate.defaultStateReconciler");
  let newState = {...reducedState}

  Object.keys(inboundState).forEach((key) => {
    console.log(`redux-persist: autoRehydrate.defaultStateReconciler inboundKey=${key}`);
    // if initialState does not have key, skip auto rehydration
    if (!state.hasOwnProperty(key)) {
      console.log(`redux-persist: autoRehydrate.defaultStateReconciler bailing early for key=${key}`);
      return;
    }

    // if initial state is an object but inbound state is null/undefined, skip
    if (typeof state[key] === 'object' && !inboundState[key]) {
      console.log('redux-persist-legacy/autoRehydrate: sub state for key `%s` is falsy but initial state is an object, skipping autoRehydrate.', key)
      return
    }

    // if reducer modifies substate, skip auto rehydration
    if (state[key] !== reducedState[key]) {
      console.log('redux-persist-legacy/autoRehydrate: sub state for key `%s` modified, skipping autoRehydrate.', key)
      newState[key] = reducedState[key]
      return
    }

    // otherwise take the inboundState
    if (isStatePlainEnough(inboundState[key]) && isStatePlainEnough(state[key])) newState[key] = {...state[key], ...inboundState[key]} // shallow merge
    else newState[key] = inboundState[key] // hard set

    console.log('redux-persist-legacy/autoRehydrate: key `%s`, rehydrated to ', key, newState[key])
  })
  return newState
}
