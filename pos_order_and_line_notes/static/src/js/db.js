odoo.define('pos_order_and_line_notes.db', function (require) {

    var DB = require('point_of_sale.DB');
    DB.include({
        init: function(options){
            this._super.apply(this, arguments);
            this.note_search_string = "";
            this.note_by_name = {};
        },
        
        search_note: function(query){
            var results = [];
            var name = query;
            results.push(this.get_note_by_name(name));
            return {'note_list':results};
        },

         get_note_by_name: function(name){
            if(this.note_by_name[name]){
                return this.note_by_name[name];
            }
            return undefined;
        },
       });

});