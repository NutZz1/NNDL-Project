const Incident = require('../models/Incident');

// GET /api/kpi/summary
exports.getKpiSummary = async (req, res) => {
  try {
    // A team manager's numbers only count their own team
    const scope = req.scope && req.scope.team ? { team: req.scope.team } : {};
    let totalReports = 0;
    let activeAssets = 0;
    let notSeenDays = 0;
    let unassignedDevices = 0;
    let lowIssues = 0;
    let criticalIssues = 0;
    let resolvedThisMonth = 0;

    try {
      totalReports = await Incident.countDocuments(scope);
      activeAssets = await Incident.countDocuments({ ...scope, status: { $ne: 'Resolved' } });
      unassignedDevices = await Incident.countDocuments({ ...scope,
        status: { $ne: 'Resolved' },
        $or: [{ assignedTeam: 'Unassigned' }, { assignedTeam: { $exists: false } }],
      });
      lowIssues = await Incident.countDocuments({ ...scope, severity: 'Low', status: { $ne: 'Resolved' } });
      criticalIssues = await Incident.countDocuments({ ...scope, severity: 'Critical', status: { $ne: 'Resolved' } });
      resolvedThisMonth = await Incident.countDocuments({ ...scope, status: 'Resolved' });

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
      notSeenDays = await Incident.countDocuments({ ...scope,
        status: { $ne: 'Resolved' },
        createdAt: { $lt: sevenDaysAgo },
      });
    } catch (dbErr) {
      console.warn('[KPIController] DB count query notice:', dbErr.message);
    }

    const kpis = {
      totalReports,
      activeAssets,
      notSeenDays,
      issuesBySeverity: {
        low: lowIssues,
        critical: criticalIssues,
      },
      unassignedDevices,
      totalLocationUpdates: totalReports,
      lastUpdated: new Date().toISOString(),
      officer: {
        name: req.user ? req.user.name : 'Officer',
        role: req.user && req.user.role === 'municipal_officer' ? 'Municipal Officer' : 'Team Manager',
        team: req.user ? req.user.team : null,
        ward: 'Amrita Campus - Ettimadai Ward',
        organization: (req.user && req.user.organization) || 'Amrita Civic & Infrastructure Authority',
      },
      wardMetrics: {
        name: 'Amrita Vishwa Vidyapeetham Sector',
        cleanlinessIndex: totalReports === 0 ? '100%' : `${Math.max(50, Math.round(100 - (activeAssets / Math.max(1, totalReports)) * 40))}%`,
        activePatrolUnits: activeAssets > 0 ? 2 : 0,
        resolvedThisMonth,
      },
    };

    res.json({ success: true, data: kpis });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
