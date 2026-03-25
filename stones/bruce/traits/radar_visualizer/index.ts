
const MATURITY_LEVELS = { adopt: 4, trial: 3, assess: 2, hold: 1 };
const MATURITY_LABELS = { 4: 'adopt', 3: 'trial', 2: 'assess', 1: 'hold' };

// 聚合多方评估
export function aggregateAssessments(assessments) {
  // assessments: Array<{ source: string, ratings: Record<string, { maturity: string, reason: string }> }>
  const techMap = {};
  
  for (const a of assessments) {
    for (const [tech, rating] of Object.entries(a.ratings)) {
      if (!techMap[tech]) techMap[tech] = [];
      techMap[tech].push({
        source: a.source,
        maturity: rating.maturity,
        score: MATURITY_LEVELS[rating.maturity] || 0,
        reason: rating.reason
      });
    }
  }
  
  const result = {};
  for (const [tech, ratings] of Object.entries(techMap)) {
    const avgScore = ratings.reduce((s, r) => s + r.score, 0) / ratings.length;
    const roundedScore = Math.round(avgScore);
    const consensus = MATURITY_LABELS[roundedScore] || 'assess';
    const maxDiff = Math.max(...ratings.map(r => r.score)) - Math.min(...ratings.map(r => r.score));
    
    result[tech] = {
      consensus,
      avgScore: avgScore.toFixed(1),
      conflict: maxDiff >= 2,
      ratings
    };
  }
  
  return result;
}

// 检测冲突（评估分歧 >= 2 级）
export function detectConflicts(aggregated) {
  const conflicts = [];
  for (const [tech, data] of Object.entries(aggregated)) {
    if (data.conflict) {
      const views = data.ratings.map(r => r.source + ": " + r.maturity + " (" + r.reason + ")").join("\n    ");
      conflicts.push({ tech, views, ratings: data.ratings });
    }
  }
  return conflicts;
}

// 文本可视化雷达
export function renderRadar(aggregated) {
  const rings = { adopt: [], trial: [], assess: [], hold: [] };
  
  for (const [tech, data] of Object.entries(aggregated)) {
    const label = data.conflict ? tech + " ⚡" : tech;
    rings[data.consensus].push(label);
  }
  
  let output = "# OOC 技术雷达\n\n";
  
  const ringDefs = [
    { key: 'adopt', name: 'ADOPT（已采用）', desc: '已验证，推荐使用' },
    { key: 'trial', name: 'TRIAL（试验中）', desc: '有价值，积极试验' },
    { key: 'assess', name: 'ASSESS（评估中）', desc: '值得探索，需要更多验证' },
    { key: 'hold', name: 'HOLD（暂缓）', desc: '暂不推荐，需要重新评估' }
  ];
  
  for (const ring of ringDefs) {
    output += "## " + ring.name + "\n";
    output += ring.desc + "\n\n";
    if (rings[ring.key].length === 0) {
      output += "（无）\n\n";
    } else {
      for (const item of rings[ring.key]) {
        output += "- " + item + "\n";
      }
      output += "\n";
    }
  }
  
  output += "---\n⚡ = 存在评估分歧\n";
  return output;
}
