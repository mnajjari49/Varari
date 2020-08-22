odoo.define('ecotech_pos_laundry.db', function (require) {

    var DB = require('point_of_sale.DB');
    DB.include({
        init: function(options){
            this._super.apply(this, arguments);
            this.group_products = [];
            this.order_write_date = null;
            this.order_by_id = {};
            this.order_sorted = [];
            this.order_search_string = "";

            //Membership Card Start
            this.membership_card_products = [];
            this.membership_card_write_date = null;
            this.membership_card_by_id = {};
            this.membership_card_sorted = [];
            this.membership_card_search_string = "";
            this.partners_name = [];
            this.partner_by_name = {};
            this.all_partners = [];
            this.membership_card_cust_search_string = "";
            this.rack_search_string = "";
            this.delivery_state_by_id = {};
            this.adjustment_by_id = {};
            this.adjustment_search_string = "";
            //Membership Card End
            this.rack_by_id = {};
            this.preference_by_id = {};
            this.membership_card_by_partner_id = {};
        },
        
        add_adjustment : function(adjustments){
            var updated_count = 0;
            var new_write_date = '';
            for(var i = 0, len = adjustments.length; i < len; i++){
                var adjustment = adjustments[i];
                if (this.adjustment_write_date &&
                        new Date(adjustment.write_date).getTime() ) {
                    continue;
                } else if ( new_write_date < adjustment.write_date ) {
                    new_write_date  = adjustment.write_date;
                }
                this.adjustment_by_id[adjustment.id] = adjustment;
                updated_count += 1;
            }
            this.adjustment_write_date = new_write_date || this.adjustment_write_date;
            if (updated_count) {
                // If there were updates, we need to completely
                this.adjustment_search_string = "";
                for (var id in this.adjustment_by_id) {
                    var adjustment = this.adjustment_by_id[id];
                    this.adjustment_search_string += this._adjustment_search_string(adjustment);
                }
            }
            return updated_count;
        },

        search_adjustment: function(query){
            try {
                query = query.replace(/[\[\]\(\)\+\*\?\.\-\!\&\^\$\|\~\_\{\}\:\,\\\/]/g,'.');
                query = query.replace(' ','.+');
                var re = RegExp("([0-9]+):.*?"+query,"gi");
            }catch(e){
                return [];
            }
            var results = [];
            var r;
            for(var i = 0; i < this.limit; i++){
                r = re.exec(this.adjustment_search_string);
                if(r){
                    var id = Number(r[1]);
                    results.push(this.get_adjustment_by_id(id));
                }else{
                    break;
                }
            }
            return results;
        },

        _adjustment_search_string: function(adjustment){
            var str =  "";
            var partner = this.get_partner_by_id(adjustment.partner_id[0])
            
            if(partner && partner.mobile){
                str += '|' + partner.mobile;
            }
            if(partner && partner.phone){
                str += '|' + partner.phone;
            }
            if(adjustment.partner_id[1]){
                str += '|' + adjustment.partner_id[1];
            }
            str = '' + adjustment.id + ':' + str.replace(':','') + '\n';
            return str;
        },

        get_adjustment_by_id : function(id){
            return this.adjustment_by_id[id];
        },

        add_rack: function(racks){
            var self = this;
            for(var i = 0, len = racks.length; i < len; i++){
                var rack = racks[i];
                this.rack_by_id[rack.id] = rack;
                self.rack_search_string += self._rack_search_string(rack);
            }
            var updated_count = 0;
            var new_write_date = '';
            for(var i = 0, len = racks.length; i < len; i++){
                var rack = racks[i];
                if (    this.rack_write_date &&
                        new Date(rack.write_date).getTime() ) {
                    continue;
                } else if ( new_write_date < rack.write_date ) {
                    new_write_date  = rack.write_date;
                }
                this.rack_by_id[rack.id] = rack;
                updated_count += 1;
            }
            this.rack_write_date = new_write_date || this.rack_write_date;
            if (updated_count) {
                // If there were updates, we need to completely
                this.rack_search_string = "";
                for (var id in this.rack_by_id) {
                    var rack = this.rack_by_id[id];
                    this.rack_search_string += this._rack_search_string(rack);
                }
            }
            return updated_count;
        },

        _rack_search_string: function(rack){
        	var str = "";
        	if(rack){
        		if(rack.name){
        			str =  rack.name;
        		}
                str = '' + rack.id + ':' + str.replace(':','') + '\n';
                return str;
            } else{
                return str;
            }
        },
        
        search_rack: function(query){
            try {
                query = query.replace(/[\[\]\(\)\+\*\?\.\-\!\&\^\$\|\~\_\{\}\:\,\\\/]/g,'.');
                query = query.replace(' ','.+');
                var re = RegExp("([0-9]+):.*?"+query,"gi");
            }catch(e){
                return [];
            }
            var results = [];
            var r;
            for(var i = 0; i < this.limit; i++){
                r = re.exec(this.rack_search_string);
                if(r){
                    var id = Number(r[1]);
                    if(this.rack_by_id[id] && !this.rack_by_id[id].status){
                        results.push(this.rack_by_id[id]);
                    }
                }else{
                    break;
                }
            }
            return _.uniq(results, res => res.id);
        },

        get_membership_card_by_id: function(id){
            return this.membership_card_by_id[id];
        },

        //Membership Card Code Start
        add_partners: function(partners){
            var res = this._super(partners);
            var self = this;
            partners.map(function(partner){
                if(partner.name){
                    self.partners_name.push(partner.name);
                    self.partner_by_name[partner.name] = partner;
                }
                self.membership_card_cust_search_string += self._membership_card_cust_search_string(partner);
            });
            if(partners.length > 0){
                _.extend(this.all_partners, partners)
            }
            return res
        },

        get_partners_name: function(){
            return this.partners_name;
        },

        get_partner_by_name: function(name){
            if(this.partner_by_name[name]){
                return this.partner_by_name[name];
            }
            return undefined;
        },

        add_membership_card: function(membership_cards){
            var updated_count = 0;
            var new_write_date = '';
            for(var i = 0, len = membership_cards.length; i < len; i++){
                var membership_card = membership_cards[i];
                if (    this.card_write_date &&
                        new Date(membership_card.write_date).getTime() ) {
                    continue;
                } else if ( new_write_date < membership_card.write_date ) {
                    new_write_date  = membership_card.write_date;
                }
                if (!this.membership_card_by_id[membership_card.id]) {
                    this.membership_card_sorted.push(membership_card.id);
                }
                this.membership_card_by_id[membership_card.id] = membership_card;
                this.membership_card_by_partner_id[membership_card.customer_id[0]] = membership_card;
                updated_count += 1;
            }
            this.card_write_date = new_write_date || this.membership_card_write_date;
            if (updated_count) {
                // If there were updates, we need to completely
                this.membership_card_search_string = "";
                for (var id in this.membership_card_by_id) {
                    var membership_card = this.membership_card_by_id[id];
                    var self = this;
                    this.membership_card_search_string += this._membership_card_search_string(membership_card);
                }
            }
            return updated_count;
        },

        add_delivery_state: function(states){
            for(var i = 0, len = states.length; i < len; i++){
                var state = states[i];
                this.delivery_state_by_id[state.id] = state;
            }
        },

        add_customer_preference: function(preferences){
            for(var i = 0, len = preferences.length; i < len; i++){
                var preference = preferences[i];
                this.preference_by_id[preference.id] = preference;
            }
        },

        _membership_card_search_string: function(membership_card){
            var str =  membership_card.card_no;
            var partner = false;
            if(membership_card.customer_id){
                partner = this.get_partner_by_id(membership_card.customer_id[0])
            }
            if(partner && partner.mobile){
                str += '|' + partner.mobile;
            }
            if(partner && partner.phone){
                str += '|' + partner.phone;
            }
            if(membership_card.customer_id){
                str += '|' + membership_card.customer_id[1];
            }
            str = '' + membership_card.id + ':' + str.replace(':','') + '\n';
            return str;
        },

        get_membership_card_write_date: function(){
            return this.membership_card_write_date;
        },

        get_membership_card_by_id: function(id){
            return this.membership_card_by_id[id];
        },

        get_delivery_state_by_id: function(id){
            return this.delivery_state_by_id[id];
        },

        get_preference_by_id : function(id){
            return this.preference_by_id[id];
        },

        _membership_card_cust_search_string: function(partner){
        	var str = "";
        	if(partner){
        		if(partner.name){
        			str =  partner.name;
        		}
                if(partner.phone){
                    str += '|' + partner.phone;
                }
                if(partner.email){
                    str += '|' + partner.phone;
                }
                str = '' + partner.id + ':' + str.replace(':','') + '\n';
                return str;
            } else{
                return str;
            }
        },
        
        search_membership_card_customer: function(query){
            try {
                query = query.replace(/[\[\]\(\)\+\*\?\.\-\!\&\^\$\|\~\_\{\}\:\,\\\/]/g,'.');
                query = query.replace(' ','.+');
                var re = RegExp("([0-9]+):.*?"+query,"gi");
            }catch(e){
                return [];
            }
            var results = [];
            var r;
            for(var i = 0; i < this.limit; i++){
                r = re.exec(this.membership_card_cust_search_string);
                if(r){
                    var id = Number(r[1]);
                    results.push(this.partner_by_id[id]);
                }else{
                    break;
                }
            }
            return _.uniq(results, res => res.id);
        },

        search_membership_card: function(query){
            try {
                query = query.replace(/[\[\]\(\)\+\*\?\.\-\!\&\^\$\|\~\_\{\}\:\,\\\/]/g,'.');
                query = query.replace(' ','.+');
                var re = RegExp("([0-9]+):.*?"+query,"gi");
            }catch(e){
                return [];
            }
            var results = [];
            var r;
            for(var i = 0; i < this.limit; i++){
                r = re.exec(this.membership_card_search_string);
                if(r){
                    var id = Number(r[1]);
                    results.push(this.get_membership_card_by_id(id));
                }else{
                    break;
                }
            }
            return results;
        },
        //Membership Card Code End
        get_rack_by_ids: function(rack_ids){
            var list = [];
            for (var i = 0, len = rack_ids.length; i < len; i++) {
                list.push(this.rack_by_id[rack_ids[i]]);
            }
            return list;
        },

        add_orders: function(orders){
            var updated_count = 0;
            var new_write_date = '';
            for(var i = 0, len = orders.length; i < len; i++){
                var order = orders[i];
                if (this.order_write_date &&
                    this.order_by_id[order.id] &&
                    new Date(this.order_write_date).getTime() + 1000 >=
                    new Date(order.write_date).getTime() ) {
                    continue;
                } else if ( new_write_date < order.write_date ) { 
                    new_write_date  = order.write_date;
                }


                if (!this.order_by_id[order.id]) {
                    this.order_sorted.push(order.id);
                }

                this.order_by_id[order.id] = order;
                updated_count += 1;
            }
            this.order_write_date = new_write_date || this.order_write_date;
            if (updated_count) {
                // If there were updates, we need to completely 
                this.order_search_string = "";
                for (var id in this.order_by_id) {
                    var order = this.order_by_id[id];
                    var partner = false;
                    if(order && order.partner_id){
                        partner = this.get_partner_by_id(order.partner_id[0])
                    }
                    if(!(order.is_adjustment || order.is_membership_order || order.is_previous_order)){
                    this.order_search_string += this._order_search_string(order, partner);
                    }

                }
            }
            return updated_count;
        },
        
        _order_search_string: function(order, partner){
            var str =  order.name;
            if(partner && partner.mobile){
                str += '|' + partner.mobile ? partner.mobile : '';
            }
            if(partner && partner.phone){
                str += '|' + partner.phone  ? partner.phone : '';
            }
            if(partner && partner.name){
                str += '|' + partner.name  ? partner.name : '';
            }
            if(order.pos_reference){
                str += '|' + order.pos_reference;
            }

            str = '' + order.id + ':' + str.replace(':','') + '\n';
            return str;
        },
        get_order_write_date: function(){
            return this.order_write_date;
        },
        get_order_by_id: function(id){
            return this.order_by_id[id];
        },
        search_order: function(query){
            try {
                query = query.replace(/[\[\]\(\)\+\*\?\.\-\!\&\^\$\|\~\_\{\}\:\,\\\/]/g,'.');
                query = query.replace(' ','.+');
                var re = RegExp("([0-9]+):.*?"+query,"gi");
            }catch(e){
                return [];
            }
            var results = [];
            var r;
            for(var i = 0; i < this.limit; i++){
                r = re.exec(this.order_search_string)   ;
                if(r){
                    var id = Number(r[1]);
                    results.push(this.get_order_by_id(id));
                }else{
                    break;
                }
            }
            return results;
        },
    });

});