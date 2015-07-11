var app = null;

Ext.define('CustomApp', {
	extend: 'Rally.app.App',
	componentCls: 'app',
	layout : {
		type : "table",
		columns : 2
	},
    
    config: {
        defaultSettings: {
            portfolioitem : [''],
            hierarchicalrequirement : ["ScheduleState","PlanEstimate"],
            task : ["State","Estimate","TaskIndex","ToDo","Actuals"]
        }
    },

	items:[ 
		{
			xtype : "label",
			text : 'Copy To Project:',
			padding : "5px"
		},

		{
			id : "project-picker",
			xtype: 'rallyprojectpicker',
			margin: "5px",
			model: 'Project',
			field: 'Name'
		},
		{
			xtype : "rallybutton",
			text : "Select Portfolio Item",
			margin: "5px",
			handler : function() {
				app.chooseItem();
			}
		},
		{
			id : "item-label",
			xtype : "label",
			margin : "5px",
			style : "font-weight:bold;",
			text : ""
		},
		{
			id : "copy-button",
			xtype : "rallybutton",
			text : "Copy",
			margin: "5px",
			disabled : true,
			handler : function() {
				app.performCopy();
			}
		},
		{
			id : "summary",
			xtype : "label",
			margin : "5px",
			style : "font-weight:bold;",
			text : ""
	}],

	launch: function() {
		app = this;
        var fieldsToCopy = { 
            portfolioitem : this.getSetting('portfolioitem'),
            hierarchicalrequirement : this.getSetting('hierarchicalrequirement'),
            task: this.getSetting('task')
        };
        
        // cleanse because sometimes they aren't arrays coming back
        if ( !Ext.isEmpty(fieldsToCopy.portfolioitem) && !Ext.isArray(fieldsToCopy.portfolioitem) ){
            fieldsToCopy.portfolioitem = fieldsToCopy.portfolioitem.split(',');
        }
        
        if ( !Ext.isEmpty(fieldsToCopy.hierarchicalrequirement) && !Ext.isArray(fieldsToCopy.hierarchicalrequirement) ){
            fieldsToCopy.hierarchicalrequirement = fieldsToCopy.hierarchicalrequirement.split(',');
        }
        
        if ( !Ext.isEmpty(fieldsToCopy.task) && !Ext.isArray(fieldsToCopy.task) ){
            fieldsToCopy.task = fieldsToCopy.task.split(',');
        }
        
        app.fieldsToCopy = fieldsToCopy;
	},

	// displays a chooser to select the portfolio item
	chooseItem : function() {

		Ext.create('Rally.ui.dialog.ChooserDialog', {
			artifactTypes: ['PortfolioItem'],
			autoShow: true,
			
			title: 'Choose Item',
			listeners: {
				artifactChosen: function(selectedRecord){
					this.down("#item-label").setText(selectedRecord.get('Name'));
					this.down("#copy-button").setDisabled(true);
					app.itemSelected(selectedRecord);

				},
				scope: this
			}
		});
	},

	// called when a portfolio item is chosen. It creates the list of items to be copied and
	// updates the summary message.
	itemSelected : function(root) {

		var config = {   model : "PortfolioItem",
			fetch : true,
			filters : [ { property : "ObjectID", operator : "=", value: root.get("ObjectID") } ]
		};

		// create a list of all items to be copied
		async.map([config], app.wsapiQuery,function(err,results){
			var item = results[0][0];
			app.list = [];

			async.map([item],app.createList,function(err,results){
				app.models = {};
				// get the distinct set of types from the list.
				app.types = _.uniq(_.map( app.list, function(l) { return l.get("_type");}));
				// load the models for the types
				async.mapSeries(app.types,app.loadModel,function(err,results) {
					// save the loaded models to an array
					_.each(app.types,function(t,i) {
						app.models[t] = results[i];
					});
					
					app.down("#summary").setText(app.list.length + " Items to be copied");
					
					// check project selected before enabling.
					var projectRef = app.down("#project-picker").getValue();

					if (projectRef !== null && projectRef !== "")
						app.down("#copy-button").setDisabled(false);
				});
			});
		});
	},

	// performs the copy of items in the list by asynchronously calling copyItem for each item
	// in the list
	performCopy : function() {
		app.copyList = {};
		app.projectRef = app.down("#project-picker").getValue();
        
		async.mapSeries(app.list,app.copyItem,function(err,results) {
			if (err===null) {
				app.down("#summary").setText(results.length + " Items copied to " + results[0].get("FormattedID"));
			} else {
				app.down("#summary").setText( err, false );
			}
		});
	},

	// copies a single item
	copyItem : function(i,callback) {

		var copy = {
			"Name": i.get("Name"),
			"Workspace" : i.get("Workspace")._ref,
			// "Description" : encodeURI(i.get("Description")),
			"Description" : i.get("Description"),
			"Owner" : i.get("Owner") !== null ? i.get("Owner")._ref : null,
			"Project" : app.projectRef
		};

		copy = app.copyTypeSpecificFields(copy,i);

		var parentRef = app.parentRef(i);
		if (parentRef!==null) {
			var mappedRef = app.copyList[parentRef.ref];
			if (!_.isUndefined(mappedRef)) {
				copy[parentRef.type] = mappedRef;
			}
		}

		var model = app.models[i.get("_type")];
		async.map([{model:model,copy:copy,source:i}],app.createItem,function(err,results){
			if (!_.isUndefined(err)&&!_.isNull(err)) {
				callback(err,null);	
			} else {
				callback(null,results[0]);
			}
		});
	},

	copyTypeSpecificFields : function(copy,item) {

        console.log('copyTypeSpecificFields', copy, item);
        
		var type = item.get("_type").toLowerCase().indexOf("portfolioitem") !== -1 ?
						"portfolioitem" :
						item.get("_type");
        
        console.log( 'type/fields', type, app.fieldsToCopy[type]);
        
        reference_fields = ['Release','Iteration','Owner'];

		_.each( app.fieldsToCopy[type], function(field) {
            if ( !Ext.isEmpty(item.get(field)) && Ext.Array.contains(reference_fields, field) ) {
                copy[field] = { _ref: item.get(field)._ref }
            } else {
                copy[field] = item.get(field);
            }
		});

		// handle tags.
		if (item.get("Tags").Count > 0) {
			var tags = _.map(item.get("Tags")._tagsNameArray,function(t) {
				return { _ref : t._ref };
			});
			copy.Tags = tags;
		}

		return copy;

	},

	// creates the new item
	createItem : function(item,callback) {
        console.log('createItem',item);
        
		var rec = Ext.create(item.model, item.copy );
		rec.save(
		{
			callback: function(result, operation) {
				if (operation.success===true) {
					app.copyList[item.source.get("_ref")] = result.get("_ref");
					app.down("#summary").setText("Created " + result.get("FormattedID"));
					callback(null,result);
				} else { 
					console.log("Error:",operation);
                    var message = "<span class='icon-warning'> </span>Create Error when copying " + item.copy.Name;
                    if (! Ext.isEmpty( operation.error ) && ! Ext.isEmpty( operation.error.errors) ) {
                        message += ":<br/>" + operation.error.errors.join('<br/>');
                    }
					callback(message,null);
				}
			}
		});

	},

	// reads a rally collection object
	readCollection : function( collectionConfig, callback ) {
		collectionConfig.reference.getCollection(collectionConfig.type,{fetch:true}).load({
			fetch : true,
			callback : function(records,operation,success) {
				callback(null,records);
			}
		});

	},

	// recursive method to create a list of all items to be copied.
	createList : function(root,callback) {

		var config = {   model : root.raw._type,
				fetch : true,
				filters : [ { property : "ObjectID", operator : "=", value: root.get("ObjectID") } ]
		};

		async.map([config], wsapiQuery, function(err,results) {

			var obj = results[0][0];
			app.list.push(obj);
			var childRef = null;
			if (app.defined(obj.get("Tasks"))) {
				childRef = "Tasks";
			} else {
				if (app.defined(obj.get("Children"))){
					childRef = "Children";
				} else {
					if (app.defined(obj.get("UserStories"))) {
						childRef = "UserStories";
					} 
				}
			}

			if (app.isObject(childRef)) {
				var config = { reference : obj, type : childRef };
				async.map([config],app.readCollection,function(err,results){
					var children = results[0];
					async.map(children,app.createList,function(err,results){
						callback(null,results);
					});
				});
			} else {
				callback(null,obj);
			}
		});
	},

	// return the type of parent reference
	parentRef : function(obj) {

		if ( _.isObject(obj.get("Parent"))) {
			return { type : "Parent", ref :  obj.get("Parent")._ref };
		}
		if ( _.isObject(obj.get("WorkProduct"))) {
			return { type : "WorkProduct", ref : obj.get("WorkProduct")._ref };
		}
		if ( _.isObject(obj.get("PortfolioItem"))) {
			return { type : "PortfolioItem", ref : obj.get("PortfolioItem")._ref };
		}
		return null;

	},

	// loads a single rally model for the type
	loadModel : function(type,callback) {

		Rally.data.ModelFactory.getModel({
			type: type,
			success: function(model) {
				callback(null,model);
			}
		});
	},

	isObject : function(obj) {
		return ( !_.isUndefined(obj) && !_.isNull(obj) );
	},

	defined : function (obj) {
		return (app.isObject(obj) && obj.Count > 0) ;
	},

	wsapiQuery : function( config , callback ) {
	
		Ext.create('Rally.data.WsapiDataStore', {
			autoLoad : true,
			limit : "Infinity",
			model : config.model,
			fetch : config.fetch,
			filters : config.filters,
			listeners : {
				scope : this,
				load : function(store, data) {
					callback(null,data);
				}
			}
		});
	},

    getSettingsFields: function() {
        return [{
            name: 'portfolioitem',
            xtype: 'rallyfieldpicker',
            autoExpand: true,
            alwaysExpanded: false,
            modelTypes: ['PortfolioItem/Feature'],
            margin: '10px 0 10px 0',
            fieldLabel: 'Feature Fields',
            _shouldShowField: function(field) {
                //console.log(field.name, field);
                var attr = field.attributeDefinition;
                //console.log('...',attr);
                
                return attr && !attr.ReadOnly && attr.AttributeType !== 'COLLECTION';
            },
            listeners: {
                ready: function(picker){ picker.collapse(); }
            },
            readyEvent: 'ready' 
            
        },
        {
            name: 'hierarchicalrequirement',
            xtype: 'rallyfieldpicker',
            autoExpand: true,
            alwaysExpanded: false,
            modelTypes: ['HierarchicalRequirement'],
            margin: '10px 0 10px 0',
            fieldLabel: 'Story Fields',
            _shouldShowField: function(field) {
                //console.log(field.name, field);
                var attr = field.attributeDefinition;
                //console.log('...',attr);
                
                return attr && !attr.ReadOnly && attr.AttributeType !== 'COLLECTION';
            },
            listeners: {
                ready: function(picker){ picker.collapse(); }
            },
            readyEvent: 'ready' 
        },
        {
            name: 'task',
            xtype: 'rallyfieldpicker',
            autoExpand: true,
            alwaysExpanded: false,
            modelTypes: ['Task'],
            margin: '10px 0 200px 0',
            fieldLabel: 'Task Fields',
            _shouldShowField: function(field) {
                //console.log(field.name, field);
                var attr = field.attributeDefinition;
                //console.log('...',attr);
                
                return attr && !attr.ReadOnly && attr.AttributeType !== 'COLLECTION';
            },
            listeners: {
                ready: function(picker){ picker.collapse(); }
            },
            readyEvent: 'ready' 
        }];
    },
    
    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    },
    
    //onSettingsUpdate:  Override
    onSettingsUpdate: function (settings){
        console.log('onSettingsUpdate',settings);
        Ext.apply(this, settings);
        
        this.launch();
    }
    

});
