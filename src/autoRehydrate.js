import { REHYDRATE } from './constants'
import isStatePlainEnough from './utils/isStatePlainEnough'

export default function autoRehydrate (config = {}) {
  console.log("redux-persist/autoRehydrate called!");
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
    console.log("redux-persist/autoRehydrate.liftReducer");
    let rehydrated = false
    let preRehydrateActions = []
    return (state, action) => {
      if (action.type !== REHYDRATE) {
        if (config.log && !rehydrated) preRehydrateActions.push(action) // store pre-rehydrate actions for debugging
        return reducer(state, action)
      } else {
        if (!rehydrated) logPreRehydrate(preRehydrateActions)
        rehydrated = true
        console.log("redux-persist/autoRehydrate.liftReducer setting rehydrated and calling reducer ");

        let inboundState = action.payload
        let reducedState = reducer(state, action)

        console.log("redux-persist/autoRehydrate.liftReducer calling state reconciler");

        return stateReconciler(state, inboundState, reducedState, config.log)
      }
    }
  }
}

function logPreRehydrate (preRehydrateActions) {
  const concernedActions = preRehydrateActions.slice(1)
  if (concernedActions.length > 0) {
    console.log(`
      redux-persist/autoRehydrate: %d actions were fired before rehydration completed. This can be a symptom of a race
      condition where the rehydrate action may overwrite the previously affected state. Consider running these actions
      after rehydration:
    `, concernedActions.length, concernedActions)
  }
}

function defaultStateReconciler (state, inboundState, reducedState, log) {
  console.log('redux-persist/autoRehydrate: in defaultStateReconciler'); 

  let newState = {...reducedState}

  Object.keys(inboundState).forEach((key) => {
    // if initialState does not have key, skip auto rehydration
    if (!state.hasOwnProperty(key)) {
      console.log("redux-persist/autoRehydrate: bailing early for key=%s", key);
    }

    // if initial state is an object but inbound state is null/undefined, skip
    if (typeof state[key] === 'object' && !inboundState[key]) {
      console.log('redux-persist/autoRehydrate: sub state for key `%s` is falsy but initial state is an object, skipping autoRehydrate.', key)
      return
    }

    // if reducer modifies substate, skip auto rehydration
    if (state[key] !== reducedState[key]) {
      console.log('redux-persist/autoRehydrate: sub state for key `%s` modified, skipping autoRehydrate.', key)
      newState[key] = reducedState[key]
      return
    }

    // otherwise take the inboundState
    if (isStatePlainEnough(inboundState[key]) && isStatePlainEnough(state[key])) newState[key] = {...state[key], ...inboundState[key]} // shallow merge
    else newState[key] = inboundState[key] // hard set

    console.log('redux-persist/autoRehydrate: key `%s`, rehydrated to ', key, newState[key])
  })
  return newState
}
