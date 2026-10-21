          </div>

          {ordersLoading ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin text-orange-600 mx-auto mb-2" />
              Loading your bookings...
            </div>
          ) : orders.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center space-y-3">
                <FileCheck className="w-10 h-10 text-muted-foreground/40 mx-auto" />
                <div className="text-xs text-muted-foreground">You have not booked any lab tests yet.</div>
                <Button
                  size="sm"
                  onClick={() => setActiveTab("book")}
                  className="bg-orange-600 hover:bg-orange-700 text-white text-xs"
                >
                  Book Your First Test
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {orders.map((ord) => (
                <Card key={ord.id} className="overflow-hidden">
                  <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-foreground">{ord.patient_name}</span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] capitalize ${
                            ord.status === "completed"
                              ? "bg-green-500/10 text-green-600 border-green-500/30"
                              : ord.status === "cancelled"
                              ? "bg-destructive/10 text-destructive border-destructive/30"
                              : "bg-orange-500/10 text-orange-600 border-orange-500/30"
                          }`}
                        >
                          {ord.status}
                        </Badge>
                        {ord.city_request_id && (
                          <span className="text-[10px] text-muted-foreground">
                            Ref: {ord.city_request_id}
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                        <span>📅 Slot: {formatSlotDateTime(ord.slot_datetime)}</span>
                        <span>📍 {ord.address}</span>
                      </div>

                      {/* Tests list */}
                      <div className="flex flex-wrap gap-1 pt-1">
                        {ord.tests && Array.isArray(ord.tests) && ord.tests.map((t, idx) => (
                          <Badge key={idx} variant="secondary" className="text-[10px]">
                            {t.name || `Test #${t.test_id || idx + 1}`}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                      {ord.report_url ? (
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white gap-1.5 text-xs h-8"
                          onClick={() => window.open(ord.report_url, "_blank")}
                        >
                          <Download className="w-3.5 h-3.5" />
                          View Lab Report
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={checkingResults === ord.id}
                          onClick={() => handleCheckResults(ord)}
                          className="gap-1.5 text-xs h-8"
                        >
                          {checkingResults === ord.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <FileCheck className="w-3.5 h-3.5" />
                          )}
                          Check Report Status
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default OrangeLabTests;
