function linear(first, second, progress) {
  return first + (second - first) * progress;
}

export function interpolateSnapshots(snapshots, renderTime) {
  const first = snapshots[0];
  if (!first) {
    return null;
  }

  const second = snapshots[1];
  if (!second || renderTime <= first.receivedAt) {
    return { x: first.x, y: first.y };
  }
  if (renderTime >= second.receivedAt) {
    return { x: second.x, y: second.y };
  }

  const duration = second.receivedAt - first.receivedAt;
  const progress = duration > 0 ? (renderTime - first.receivedAt) / duration : 1;
  return {
    x: linear(first.x, second.x, progress),
    y: linear(first.y, second.y, progress),
  };
}
