odoo.define('pos_order_and_line_notes.models', function (require) {

    var models = require('point_of_sale.models');
    var rpc = require('web.rpc');
    var field_utils = require('web.field_utils');
    var session = require('web.session');
    var time = require('web.time');
    var utils = require('web.utils');
    var round_pr = utils.round_precision;

    models.load_fields("pos.note.config", ['name'],)
    models.load_fields("pos.order", ['note_id'],)
    models.load_fields("pos.order.line", ['note_id'],)

    models.PosModel.prototype.models.push({
        model:  'pos.note.config',
        fields: ['name'],
        domain: [],
        loaded: function(self, note_list){
            self.set({'note_list' : note_list});
        },
    });

});
