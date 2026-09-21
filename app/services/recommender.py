"""Anti-clustering re-ranking and sub-topic diversification algorithms."""
from typing import Dict, Any, List


def anti_cluster_rerank(candidates: List[Dict[str, Any]], max_consecutive: int = 2) -> List[Dict[str, Any]]:
    """Enforces sliding-window anti-clustering invariant:
    no sub-topic appears more than max_consecutive times consecutively.
    """
    result = []
    pool = list(candidates)

    while pool:
        chosen_index = None
        for idx, item in enumerate(pool):
            sub = item.get("sub_topic", "general")
            if len(result) >= max_consecutive:
                streak = [r.get("sub_topic") for r in result[-max_consecutive:]]
                if all(s == sub for s in streak):
                    # Invariant breach! Skip this item to avoid 3 identical sub-topics in a row
                    continue
            chosen_index = idx
            break

        if chosen_index is None:
            # If all remaining items share the same sub-topic, append remaining and break
            result.extend(pool)
            break

        result.append(pool.pop(chosen_index))

    return result
